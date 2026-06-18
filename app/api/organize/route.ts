import { NextResponse } from "next/server";
import { getWorkingDir } from "@/lib/workspace/settings";
import { listWorkspace } from "@/lib/workspace/fs";
import { runOrganize } from "@/lib/workspace/organize";

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

/** Run the organize pass over the inbox. */
export async function POST() {
  if (!getWorkingDir()) {
    return NextResponse.json(
      { error: "ワーキングディレクトリが設定されていません。" },
      { status: 400 },
    );
  }
  try {
    const result = await runOrganize();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
