import { NextResponse, type NextRequest } from "next/server";
import { getAiConfig } from "@/lib/ai/config";
import { runPipeline } from "@/lib/pipeline";
import { persistDocument } from "@/lib/pipeline/persist";
import { mapWithConcurrency } from "@/lib/concurrency";

// unpdf / mammoth / node:crypto require the Node.js runtime.
export const runtime = "nodejs";
export const maxDuration = 60;

// Cap per-file upload size: each file is buffered fully into memory (and base64
// re-buffered for vision), so a multi-GB file could exhaust the standalone node
// server. Matches the desktop read_file cap (src-tauri/src/lib.rs).
const MAX_UPLOAD_BYTES = 64 * 1024 * 1024; // 64 MB

// How many files to run through the pipeline at once. Each file is an independent
// network-bound Gemini round-trip, so modest parallelism cuts batch wall-clock
// dramatically while staying well under Gemini rate limits. Overridable via env.
const DEFAULT_INGEST_CONCURRENCY = 4;
function ingestConcurrency(): number {
  const raw = Number(process.env.KURA_INGEST_CONCURRENCY);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_INGEST_CONCURRENCY;
}

interface IngestFileResult {
  filename: string;
  documentId?: string;
  cached?: boolean;
  doc_type?: string;
  title?: string;
  confidence?: number;
  is_stub?: boolean;
  error?: string;
}

/** Progress events streamed (NDJSON) when the client opts into a live console
 *  via `Accept: application/x-ndjson`. `error` covers a whole-batch failure. */
type IngestEvent =
  | { type: "start"; total: number }
  | { type: "file-start"; index: number; total: number; filename: string }
  | {
      type: "file-done";
      index: number;
      total: number;
      result: IngestFileResult;
    }
  | { type: "done"; results: IngestFileResult[] }
  | { type: "error"; message: string };

/** Ingest a batch of files, emitting per-file progress as it goes. The optional
 *  callback lets the streaming path surface live progress; non-streaming callers
 *  (the desktop folder-watcher) just take the returned array. */
async function ingestFiles(
  files: File[],
  collectionId: string | null,
  onEvent?: (event: IngestEvent) => void,
): Promise<IngestFileResult[]> {
  const emit = (event: IngestEvent) => onEvent?.(event);
  // BYOK: resolve the local API key + model choices for the whole batch.
  const ai = getAiConfig();
  const total = files.length;
  emit({ type: "start", total });

  // Process files with bounded concurrency. mapWithConcurrency preserves input
  // order in the returned array (so the non-streaming `{ results }` response is
  // stable), while per-file events fire as each file actually completes — which
  // may interleave. The NDJSON consumer keys on `index`, so out-of-order
  // file-done events are fine.
  const results = await mapWithConcurrency(
    files,
    ingestConcurrency(),
    async (file, i) => {
      const index = i + 1;
      emit({ type: "file-start", index, total, filename: file.name });
      let result: IngestFileResult;
      try {
        // Reject oversized files before reading them into memory, so one huge
        // file fails its own entry instead of buffering GBs (or OOM-ing).
        if (file.size > MAX_UPLOAD_BYTES) {
          result = {
            filename: file.name,
            error: `ファイルが大きすぎます(上限 ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB)。`,
          };
        } else {
          // Read the body inside the try so a single corrupt/aborted file fails
          // just its own entry instead of sinking the whole batch.
          const input = {
            bytes: new Uint8Array(await file.arrayBuffer()),
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
          };
          const output = await runPipeline(input, ai);
          const { documentId, cached } = await persistDocument(
            input,
            output,
            collectionId,
          );
          result = {
            filename: file.name,
            documentId,
            cached,
            doc_type: output.analysis.doc_type,
            title: output.analysis.title,
            confidence: output.analysis.confidence,
            is_stub: output.analysis.is_stub,
          };
        }
      } catch (e) {
        result = { filename: file.name, error: (e as Error).message };
      }
      emit({ type: "file-done", index, total, result });
      return result;
    },
  );

  emit({ type: "done", results });
  return results;
}

/**
 * Ingest one or more files: run the pipeline (extract → classify+extract →
 * embed) and persist locally. Used by both the web upload UI and the Tauri
 * desktop folder-watcher (which POSTs watched files here).
 *
 * Responds either as a single `{ results }` JSON object (default — the folder
 * watcher relies on this) or, when the client sends `Accept:
 * application/x-ndjson`, as a stream of per-file progress events so the upload
 * UI can show a live console.
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    // Non-multipart / malformed body: same clean 400 as "no files".
    return NextResponse.json(
      { error: "ファイルが含まれていません。" },
      { status: 400 },
    );
  }
  const rawCollectionId = form.get("collection_id");
  const collectionId =
    typeof rawCollectionId === "string" && rawCollectionId
      ? rawCollectionId
      : null;
  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json(
      { error: "ファイルが含まれていません。" },
      { status: 400 },
    );
  }

  const wantsStream = req.headers
    .get("accept")
    ?.includes("application/x-ndjson");
  if (!wantsStream) {
    const results = await ingestFiles(files, collectionId);
    return NextResponse.json({ results });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: IngestEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await ingestFiles(files, collectionId, send);
      } catch (e) {
        // Headers are already flushed (status 200), so a batch-level failure is
        // reported as a final error event rather than a status code.
        send({ type: "error", message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      // Tell any intermediary proxy not to buffer, so events arrive live.
      "X-Accel-Buffering": "no",
    },
  });
}
