import { NextResponse, type NextRequest } from "next/server";
import { getWorkingDir, setWorkingDir } from "@/lib/workspace/settings";

// fs / node:path require the Node.js runtime.
export const runtime = "nodejs";

/** Return the currently configured working directory (or null). */
export async function GET() {
  return NextResponse.json({ workingDir: getWorkingDir() });
}

/** Set the working directory. Body: { path: string } (absolute, existing dir). */
export async function POST(req: NextRequest) {
  let body: { path?: unknown };
  try {
    body = (await req.json()) as { path?: unknown };
  } catch {
    return NextResponse.json({ error: "不正なリクエストです。" }, { status: 400 });
  }
  const p = typeof body.path === "string" ? body.path : "";
  try {
    setWorkingDir(p);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  return NextResponse.json({ workingDir: getWorkingDir() });
}
