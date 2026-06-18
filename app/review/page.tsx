import { PageShell } from "@/components/PageShell";
import { ReviewForm } from "@/components/ReviewForm";
import * as documentsRepo from "@/lib/db/repositories/documents";
import * as collectionsRepo from "@/lib/db/repositories/collections";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const docs = documentsRepo.listNeedsReview();
  const collections = collectionsRepo.listIdName();

  return (
    <PageShell
      title="確認待ち"
      description="AIの整理案を確認し、修正または確定します。修正内容は精度改善の正解データになります。"
    >
      {docs.length === 0 ? (
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
