import { getSessionContext } from "@/lib/auth";
import { isGeminiConfigured, isSupabaseConfigured } from "@/lib/env";
import { PageShell } from "@/components/PageShell";
import { SetupNotice } from "@/components/SetupNotice";
import { SearchBox } from "@/components/SearchBox";
import type { CollectionRow } from "@/lib/db/types";

export default async function SearchPage() {
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
      title="検索"
      description="種別やコレクションで絞り込みつつ、あいまいな言葉でも意味検索できます。"
    >
      {!isSupabaseConfigured() ? (
        <SetupNotice what="検索には Supabase の設定とログインが必要です。" />
      ) : (
        <SearchBox collections={collections} geminiEnabled={isGeminiConfigured()} />
      )}
    </PageShell>
  );
}
