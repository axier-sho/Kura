import { NextResponse, type NextRequest } from "next/server";
import * as documents from "@/lib/db/repositories/documents";
import { readFile } from "@/lib/storage/local";

export const runtime = "nodejs";

/** Stream a document's original file from local storage. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const doc = documents.getById(id);
  if (!doc?.storage_path) {
    return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  }

  // Read directly (no separate existence check): the file can be deleted/moved/
  // made unreadable between a check and the read — in organize mode it lives in
  // the user's working dir and can vanish at any time. A read failure degrades to
  // the intended 404 rather than an uncaught 500.
  let bytes: Buffer;
  try {
    bytes = readFile(doc.storage_path);
  } catch {
    return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  }
  const filename = encodeURIComponent(doc.original_filename ?? "document");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mime_type ?? "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${filename}`,
    },
  });
}
