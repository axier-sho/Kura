import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { runPipeline } from "@/lib/pipeline";
import { persistDocument } from "@/lib/pipeline/persist";

// unpdf / mammoth / node:crypto require the Node.js runtime.
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Ingest one or more files: run the pipeline (extract → classify+extract →
 * embed) and persist. Used by both the web upload UI and the Tauri desktop
 * folder-watcher (which POSTs watched files here with the user's session).
 */
export async function POST(req: NextRequest) {
  const { supabase, orgId } = await getSessionContext();
  if (!supabase || !orgId) {
    return NextResponse.json(
      { error: "未認証です(Supabase の設定とログインが必要です)。" },
      { status: 401 },
    );
  }

  const form = await req.formData();
  const collectionId = (form.get("collection_id") as string) || null;
  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json(
      { error: "ファイルが含まれていません。" },
      { status: 400 },
    );
  }

  const results: Array<Record<string, unknown>> = [];
  for (const file of files) {
    const input = {
      bytes: new Uint8Array(await file.arrayBuffer()),
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
    };
    try {
      const output = await runPipeline(input);
      const { documentId, cached } = await persistDocument(
        supabase,
        orgId,
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
