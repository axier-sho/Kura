import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { DocumentCard } from "@/components/DocumentCard";
import * as documentsRepo from "@/lib/db/repositories/documents";
import * as collectionsRepo from "@/lib/db/repositories/collections";
import type { DocumentRow } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export default async function CollectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string; from?: string; to?: string }>;
}) {
  const { id } = await params;
  const { type, from, to } = await searchParams;

  const col = collectionsRepo.getById(id);
  if (!col) notFound();

  const docs = documentsRepo.listByCollection(id, { type, from, to });
  const types = documentsRepo.listDocTypesByCollection(id);

  // Group displayed docs by doc_type.
  const groups = new Map<string, DocumentRow[]>();
  for (const d of docs) {
    const key = d.doc_type ?? "未分類";
    const list = groups.get(key) ?? [];
    list.push(d);
    groups.set(key, list);
  }

  return (
    <PageShell title={col.name} description={col.description ?? undefined}>
      <div className="mb-4">
        <Link href="/collections" className="text-sm text-kura-accent hover:underline">
          ← コレクション一覧
        </Link>
      </div>

      <form className="card mb-6 flex flex-wrap items-end gap-3" method="get">
        <div>
          <label className="label">種別</label>
          <select name="type" defaultValue={type ?? ""} className="input min-w-40">
            <option value="">すべて</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">取り込み日(from)</label>
          <input type="date" name="from" defaultValue={from ?? ""} className="input" />
        </div>
        <div>
          <label className="label">取り込み日(to)</label>
          <input type="date" name="to" defaultValue={to ?? ""} className="input" />
        </div>
        <button type="submit" className="btn-ghost">
          絞り込み
        </button>
      </form>

      {docs.length === 0 ? (
        <div className="card text-sm text-gray-500">該当する書類がありません。</div>
      ) : (
        <div className="space-y-8">
          {Array.from(groups.entries()).map(([groupType, groupDocs]) => (
            <section key={groupType}>
              <h2 className="mb-3 text-sm font-semibold text-gray-700">
                {groupType}({groupDocs.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {groupDocs.map((d) => (
                  <DocumentCard key={d.id} doc={d} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}
