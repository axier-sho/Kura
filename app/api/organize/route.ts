import { NextResponse, type NextRequest } from "next/server";
import { getWorkingDir } from "@/lib/workspace/settings";
import { listWorkspace } from "@/lib/workspace/fs";
import { runOrganize, type OrganizeEvent } from "@/lib/workspace/organize";
import * as organizeRuns from "@/lib/db/repositories/organizeRuns";

// All filesystem work (list/move/create) happens here in the local Next.js
// server via Node fs — NOT in the Tauri shell. The desktop webview only calls
// this endpoint over http://localhost; Tauri supplies the path via pick_folder.
export const runtime = "nodejs";
export const maxDuration = 60;

/** Summarize the working directory: inbox count + category folders + history. */
export async function GET() {
  const workingDir = getWorkingDir();
  if (!workingDir) return NextResponse.json({ workingDir: null });
  try {
    const listing = listWorkspace(workingDir);
    return NextResponse.json({
      workingDir,
      inboxCount: listing.inboxFiles.length,
      categories: listing.categories,
      history: organizeRuns.listRecent(20),
      undoableRunId: organizeRuns.latestUndoable(workingDir)?.id ?? null,
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
export async function POST(req: NextRequest) {
  if (!getWorkingDir()) {
    return NextResponse.json(
      { error: "ワーキングディレクトリが設定されていません。" },
      { status: 400 },
    );
  }

  // Optional JSON body: the per-run instruction (incl. appended feedback) and
  // the feedback delta. Absent/invalid body simply runs with no instruction.
  let instruction: string | undefined;
  let feedback: string | undefined;
  try {
    const body = (await req.json()) as {
      instruction?: unknown;
      feedback?: unknown;
    };
    if (typeof body?.instruction === "string") instruction = body.instruction;
    if (typeof body?.feedback === "string") feedback = body.feedback;
  } catch {
    // No/invalid body — run with no instruction.
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: OrganizeEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await runOrganize(send, { instruction, feedback });
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
