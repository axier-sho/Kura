import { isAiConfigured } from "@/lib/ai/config";
import { PageShell } from "@/components/PageShell";
import { SearchBox } from "@/components/SearchBox";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  return (
    <PageShell
      title="検索"
      description="タイトルや種別で絞り込みつつ、あいまいな言葉でも意味検索できます。"
    >
      <SearchBox geminiEnabled={isAiConfigured()} />
    </PageShell>
  );
}
