import Link from "next/link";
import { getSessionContext } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { PageShell } from "@/components/PageShell";
import { SetupNotice } from "@/components/SetupNotice";
import { createCollection } from "./actions";
import type { CollectionRow } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const { supabase, user, orgId } = await getSessionContext();

  let collections: CollectionRow[] = [];
  if (supabase && orgId) {
    const { data } = await supabase
      .from("collections")
      .select("*")
      .order("created_at", { ascending: false });
    collections = (data as CollectionRow[]) ?? [];
  }

  return (
    <PageShell
      email={user?.email}
      title="コレクション"
      description="書類は「コレクション → 種別 → ファイル」の階層で整理されます。"
    >
      {!isSupabaseConfigured() ? (
        <SetupNotice what="コレクションには Supabase の設定とログインが必要です。" />
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2">
            {collections.length === 0 ? (
              <div className="card text-sm text-gray-500">
                コレクションがありません。右のフォームから作成してください。
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {collections.map((c) => (
                  <li key={c.id}>
                    <Link href={`/collections/${c.id}`} className="card block hover:border-kura-accent">
                      <h3 className="font-semibold">{c.name}</h3>
                      {c.description && (
                        <p className="mt-1 text-sm text-gray-500">{c.description}</p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form action={createCollection} className="card h-fit space-y-3">
            <h2 className="text-sm font-semibold">新しいコレクション</h2>
            <div>
              <label className="label">名前</label>
              <input name="name" required className="input" placeholder="例: A社 / 2026年度 / 案件X" />
            </div>
            <div>
              <label className="label">説明(任意)</label>
              <input name="description" className="input" />
            </div>
            <button type="submit" className="btn-primary w-full">
              作成
            </button>
          </form>
        </div>
      )}
    </PageShell>
  );
}
