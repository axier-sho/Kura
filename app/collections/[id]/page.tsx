import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { PageShell } from "@/components/PageShell";
import { SetupNotice } from "@/components/SetupNotice";
import { DocumentCard } from "@/components/DocumentCard";
import type { CollectionRow, DocumentRow } from "@/lib/db/types";

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
  const { supabase, user, orgId } = await getSessionContext();

  if (!isSupabaseConfigured()) {
    return (
      <PageShell email={user?.email} title="コレクション">
        <SetupNotice />
      </PageShell>
    );
  }
  if (!supabase || !orgId) {
    return (
      <PageShell email={user?.email} title="コレクション">
        <SetupNotice what="ログインが必要です。" />
      </PageShell>
    );
  }

  const { data: collection } = await supabase
    .from("collections")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!collection) notFound();
  const col = collection as CollectionRow;

  let query = supabase
    .from("documents")
    .select("*")
    .eq("collection_id", id)
    .order("created_at", { ascending: false });
  if (type) query = query.eq("doc_type", type);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);
  const { data } = await query;
  const docs = (data as DocumentRow[]) ?? [];

  // doc_type list for the filter (from all docs in this collection).
  const { data: allTypes } = await supabase
    .from("documents")
    .select("doc_type")
    .eq("collection_id", id);
  const types = Array.from(
    new Set((allTypes ?? []).map((r) => r.doc_type).filter(Boolean)),
  ) as string[];

  // Group displayed docs by doc_type.
  const groups = new Map<string, DocumentRow[]>();
  for (const d of docs) {
    const key = d.doc_type ?? "未分類";
    const list = groups.get(key) ?? [];
    list.push(d);
    groups.set(key, list);
  }

  return (
    <PageShell email={user?.email} title={col.name} description={col.description ?? undefined}>
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
