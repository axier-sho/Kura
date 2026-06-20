import { NextResponse } from "next/server";
import { getWorkingDir } from "@/lib/workspace/settings";
import { listWorkspace } from "@/lib/workspace/fs";
import { runOrganize, type OrganizeEvent } from "@/lib/workspace/organize";

// All filesystem work (list/move/create) happens here in the local Next.js
// server via Node fs — NOT in the Tauri shell. The desktop webview only calls
// this endpoint over http://localhost; Tauri supplies the path via pick_folder.
export const runtime = "nodejs";
export const maxDuration = 60;

/** Summarize the working directory: inbox count + category folders. */
export async function GET() {
  const workingDir = getWorkingDir();
  if (!workingDir) return NextResponse.json({ workingDir: null });
  try {
    const listing = listWorkspace(workingDir);
    return NextResponse.json({
      workingDir,
      inboxCount: listing.inboxFiles.length,
      categories: listing.categories,
    });
  } catch (e) {
    return NextResponse.json(
      { workingDir, error: (e as Error).message },
      { status: 500 },
    );
  }
}

/**
 * Run the organize pass over the inbox, streaming per-file progress as NDJSON
 * (one JSON event per line). The desktop UI reads the stream live so the user
 * can watch each file being analyzed/moved instead of waiting on an opaque
 * spinner. The terminal `done` event carries the full summary.
 */
export async function POST() {
  if (!getWorkingDir()) {
    return NextResponse.json(
      { error: "ワーキングディレクトリが設定されていません。" },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: OrganizeEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await runOrganize(send);
      } catch (e) {
        // The HTTP status is already 200 (headers flushed), so a mid-run
        // failure is reported as a final error event rather than a status code.
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
