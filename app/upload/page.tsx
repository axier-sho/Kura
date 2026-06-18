import { PageShell } from "@/components/PageShell";
import { UploadDropzone } from "@/components/UploadDropzone";
import * as collectionsRepo from "@/lib/db/repositories/collections";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const collections = collectionsRepo.listIdName();

  return (
    <PageShell
      title="取り込み"
      description="ファイルをアップロードすると、AIが種別判定と項目抽出を行い、確認待ちに入ります。"
    >
      <div className="max-w-2xl">
        <UploadDropzone collections={collections} />
      </div>
    </PageShell>
  );
}
