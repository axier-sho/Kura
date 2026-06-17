import { getSessionContext } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { PageShell } from "@/components/PageShell";
import { SetupNotice } from "@/components/SetupNotice";
import { ReviewForm } from "@/components/ReviewForm";
import type { CollectionRow, DocumentRow } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const { supabase, user, orgId } = await getSessionContext();

  let docs: DocumentRow[] = [];
  let collections: Pick<CollectionRow, "id" | "name">[] = [];
  if (supabase && orgId) {
    const [{ data: d }, { data: c }] = await Promise.all([
      supabase
        .from("documents")
        .select("*")
        .eq("status", "needs_review")
        .order("created_at", { ascending: false }),
      supabase.from("collections").select("id, name").order("name"),
    ]);
    docs = (d as DocumentRow[]) ?? [];
    collections = c ?? [];
  }

  return (
    <PageShell
      email={user?.email}
      title="確認待ち"
      description="AIの整理案を確認し、修正または確定します。修正内容は精度改善の正解データになります。"
    >
      {!isSupabaseConfigured() ? (
        <SetupNotice what="確認待ちには Supabase の設定とログインが必要です。" />
      ) : docs.length === 0 ? (
        <div className="card text-sm text-gray-500">
          確認待ちの書類はありません。「取り込み」からファイルを追加してください。
        </div>
      ) : (
        <div className="space-y-5">
          {docs.map((doc) => (
            <ReviewForm key={doc.id} doc={doc} collections={collections} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
