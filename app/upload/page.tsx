import { getSessionContext } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { PageShell } from "@/components/PageShell";
import { SetupNotice } from "@/components/SetupNotice";
import { UploadDropzone } from "@/components/UploadDropzone";
import type { CollectionRow } from "@/lib/db/types";

export default async function UploadPage() {
  const { supabase, user, orgId } = await getSessionContext();

  let collections: Pick<CollectionRow, "id" | "name">[] = [];
  if (supabase && orgId) {
    const { data } = await supabase
      .from("collections")
      .select("id, name")
      .order("name");
    collections = data ?? [];
  }

  return (
    <PageShell
      email={user?.email}
      title="取り込み"
      description="ファイルをアップロードすると、AIが種別判定と項目抽出を行い、確認待ちに入ります。"
    >
      {!isSupabaseConfigured() ? (
        <SetupNotice what="取り込みには Supabase の設定とログインが必要です。" />
      ) : (
        <div className="max-w-2xl">
          <UploadDropzone collections={collections} />
        </div>
      )}
    </PageShell>
  );
}
