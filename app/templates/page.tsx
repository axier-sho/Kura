import { getSessionContext } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { PageShell } from "@/components/PageShell";
import { SetupNotice } from "@/components/SetupNotice";
import { DraftGenerator } from "@/components/DraftGenerator";
import { createTemplate } from "./actions";
import type { DocumentRow, TemplateRow } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const { supabase, user, orgId } = await getSessionContext();

  let templates: TemplateRow[] = [];
  let documents: Pick<DocumentRow, "id" | "title" | "original_filename">[] = [];
  if (supabase && orgId) {
    const [{ data: t }, { data: d }] = await Promise.all([
      supabase.from("templates").select("*").order("created_at", { ascending: false }),
      supabase
        .from("documents")
        .select("id, title, original_filename")
        .eq("status", "confirmed")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    templates = (t as TemplateRow[]) ?? [];
    documents = d ?? [];
  }

  return (
    <PageShell
      email={user?.email}
      title="テンプレート / ドラフト生成"
      description="差し込み欄付きのテンプレートを登録し、抽出済み項目から書類ドラフトを自動生成します。"
    >
      {!isSupabaseConfigured() ? (
        <SetupNotice what="テンプレートには Supabase の設定とログインが必要です。" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <form action={createTemplate} className="card space-y-3">
              <h2 className="text-sm font-semibold">新しいテンプレート</h2>
              <div>
                <label className="label">名前</label>
                <input name="name" required className="input" placeholder="例: 契約更新通知" />
              </div>
              <div>
                <label className="label">対象種別(任意)</label>
                <input name="doc_type" className="input" placeholder="例: 賃貸借契約書" />
              </div>
              <div>
                <label className="label">本文(差し込みは {"{{ 項目名 }}"} の形式)</label>
                <textarea
                  name="body"
                  rows={6}
                  className="input font-mono text-xs"
                  placeholder={"{{ 当事者名 }} 様\n\n{{ 物件名 }} の契約は {{ 更新日 }} に更新期日を迎えます。"}
                />
              </div>
              <button type="submit" className="btn-primary w-full">
                登録
              </button>
            </form>

            {templates.length > 0 && (
              <div className="card">
                <h2 className="mb-2 text-sm font-semibold">登録済みテンプレート</h2>
                <ul className="space-y-2 text-sm">
                  {templates.map((t) => (
                    <li key={t.id} className="rounded-md border border-gray-100 p-2">
                      <div className="font-medium">{t.name}</div>
                      {t.doc_type && (
                        <div className="text-xs text-gray-400">{t.doc_type}</div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <DraftGenerator templates={templates} documents={documents} />
        </div>
      )}
    </PageShell>
  );
}
