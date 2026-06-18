import { isGeminiConfigured } from "@/lib/env";
import { PageShell } from "@/components/PageShell";
import { SearchBox } from "@/components/SearchBox";
import * as collectionsRepo from "@/lib/db/repositories/collections";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const collections = collectionsRepo.listIdName();

  return (
    <PageShell
      title="検索"
      description="種別やコレクションで絞り込みつつ、あいまいな言葉でも意味検索できます。"
    >
      <SearchBox collections={collections} geminiEnabled={isGeminiConfigured()} />
    </PageShell>
  );
}
