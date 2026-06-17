import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/** Redirect to a short-lived signed URL for a document's original file. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, orgId } = await getSessionContext();
  if (!supabase || !orgId) {
    return NextResponse.json({ error: "未認証" }, { status: 401 });
  }

  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!doc?.storage_path) {
    return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from(env.storageBucket)
    .createSignedUrl(doc.storage_path, 300);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "URLの生成に失敗" }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl);
}
