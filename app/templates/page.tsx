import { PageShell } from "@/components/PageShell";
import { DraftGenerator } from "@/components/DraftGenerator";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { createTemplate, updateTemplate, deleteTemplate } from "./actions";
import * as templatesRepo from "@/lib/db/repositories/templates";
import * as documentsRepo from "@/lib/db/repositories/documents";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = templatesRepo.listAll();
  const documents = documentsRepo.listConfirmedForDrafts(100);

  return (
    <PageShell
      title="テンプレート / ドラフト生成"
      description="差し込み欄付きのテンプレートを登録し、抽出済み項目から書類ドラフトを自動生成します。"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <form action={createTemplate} className="card space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">新しいテンプレート</h2>
            <Field label="名前">
              <Input name="name" required placeholder="例: 契約更新通知" />
            </Field>
            <Field label="対象種別(任意)">
              <Input name="doc_type" placeholder="例: 賃貸借契約書" />
            </Field>
            <Field label={`本文(差し込みは ${"{{ 項目名 }}"} の形式)`}>
              <Textarea
                name="body"
                rows={6}
                required
                className="font-mono text-xs"
                placeholder={"{{ 当事者名 }} 様\n\n{{ 物件名 }} の契約は {{ 更新日 }} に更新期日を迎えます。"}
              />
            </Field>
            <Button type="submit" className="w-full">
              登録
            </Button>
          </form>

            {templates.length > 0 && (
              <div className="card">
                <h2 className="mb-2 text-sm font-semibold">登録済みテンプレート</h2>
                <ul className="space-y-4 text-sm">
                  {templates.map((t) => (
                    <li
                      key={t.id}
                      className="space-y-2 rounded-md border border-gray-100 p-3"
                    >
                      <form action={updateTemplate} className="space-y-2">
                        <input type="hidden" name="id" value={t.id} />
                        <input
                          name="name"
                          required
                          defaultValue={t.name}
                          className="input"
                        />
                        <input
                          name="doc_type"
                          defaultValue={t.doc_type ?? ""}
                          placeholder="対象種別(任意)"
                          className="input"
                        />
                        <textarea
                          name="body"
                          rows={4}
                          required
                          defaultValue={t.body}
                          className="input font-mono text-xs"
                        />
                        <div className="flex gap-2">
                          <button type="submit" className="btn-ghost text-xs">
                            保存
                          </button>
                        </div>
                      </form>
                      <form action={deleteTemplate}>
                        <input type="hidden" name="id" value={t.id} />
                        <button
                          type="submit"
                          className="btn-ghost text-xs text-kura-danger"
                        >
                          削除
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <DraftGenerator templates={templates} documents={documents} />
        </div>
    </PageShell>
  );
}
