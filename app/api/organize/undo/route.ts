import { NextResponse, type NextRequest } from "next/server";
import { getWorkingDir } from "@/lib/workspace/settings";
import { undoOrganizeRun } from "@/lib/workspace/undo";

// Filesystem work (moving files back into the inbox) happens here via Node fs,
// same as the organize route. Synchronous + small, so no streaming.
export const runtime = "nodejs";
export const maxDuration = 60;

/** Undo a previous organize run: move its auto-moved files back to the inbox. */
export async function POST(req: NextRequest) {
  if (!getWorkingDir()) {
    return NextResponse.json(
      { error: "ワーキングディレクトリが設定されていません。" },
      { status: 400 },
    );
  }

  let runId: string | undefined;
  try {
    const body = (await req.json()) as { runId?: unknown };
    if (typeof body?.runId === "string") runId = body.runId;
  } catch {
    // Fall through to the missing-id check below.
  }
  if (!runId) {
    return NextResponse.json(
      { error: "runId が指定されていません。" },
      { status: 400 },
    );
  }

  try {
    const result = undoOrganizeRun(runId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
