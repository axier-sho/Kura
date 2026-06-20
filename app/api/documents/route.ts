import { NextResponse, type NextRequest } from "next/server";
import { getAiConfig } from "@/lib/ai/config";
import { runPipeline } from "@/lib/pipeline";
import { persistDocument } from "@/lib/pipeline/persist";

// unpdf / mammoth / node:crypto require the Node.js runtime.
export const runtime = "nodejs";
export const maxDuration = 60;

// Cap per-file upload size: each file is buffered fully into memory (and base64
// re-buffered for vision), so a multi-GB file could exhaust the standalone node
// server. Matches the desktop read_file cap (src-tauri/src/lib.rs).
const MAX_UPLOAD_BYTES = 64 * 1024 * 1024; // 64 MB

/**
 * Ingest one or more files: run the pipeline (extract → classify+extract →
 * embed) and persist locally. Used by both the web upload UI and the Tauri
 * desktop folder-watcher (which POSTs watched files here).
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

  // BYOK: resolve the local API key + model choices for the whole batch.
  const ai = getAiConfig();

  const results: Array<Record<string, unknown>> = [];
  for (const file of files) {
    try {
      // Reject oversized files before reading them into memory, so one huge file
      // fails its own entry instead of buffering GBs (or OOM-ing the process).
      if (file.size > MAX_UPLOAD_BYTES) {
        results.push({
          filename: file.name,
          error: `ファイルが大きすぎます(上限 ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB)。`,
        });
        continue;
      }
      // Read the body inside the try so a single corrupt/aborted file fails just
      // its own entry; reading it before the try would reject out of the loop and
      // sink the whole batch (the desktop watcher POSTs several files at once).
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
      results.push({
        filename: file.name,
        documentId,
        cached,
        doc_type: output.analysis.doc_type,
        title: output.analysis.title,
        confidence: output.analysis.confidence,
        is_stub: output.analysis.is_stub,
      });
    } catch (e) {
      results.push({ filename: file.name, error: (e as Error).message });
    }
  }

  return NextResponse.json({ results });
}
