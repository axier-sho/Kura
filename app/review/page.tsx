import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { ReviewForm } from "@/components/ReviewForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { DocumentIcon } from "@/components/ui/icons";
import * as documentsRepo from "@/lib/db/repositories/documents";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const docs = documentsRepo.listNeedsReview();

  return (
    <PageShell
      title="確認待ち"
      description="AIの整理案を確認し、修正または確定します。修正内容は精度改善の正解データになります。"
    >
      {docs.length === 0 ? (
        <EmptyState
          icon={<DocumentIcon />}
          title="確認待ちの書類はありません"
          description="「整理」でフォルダを振り分けると、確認が必要な書類がここに表示されます。"
          action={
            <Link href="/organize" className="btn-primary">
              整理へ
            </Link>
          }
        />
      ) : (
        <div className="space-y-5">
          {docs.map((doc) => (
            <ReviewForm key={doc.id} doc={doc} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
