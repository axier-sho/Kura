import { reviewDocument } from "@/app/review/actions";
import type { DocumentRow } from "@/lib/db/types";

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  const pct = Math.round(value * 100);
  const cls =
    pct >= 80
      ? "bg-kura-accentSoft text-kura-accent"
      : pct >= 50
        ? "bg-amber-100 text-kura-warn"
        : "bg-red-100 text-kura-danger";
  return <span className={`badge ${cls}`}>確信度 {pct}%</span>;
}

export function ReviewForm({
  doc,
  collections,
}: {
  doc: DocumentRow;
  collections: { id: string; name: string }[];
}) {
  const fieldEntries = Object.entries(doc.extracted_fields ?? {});

  return (
    <form action={reviewDocument} className="card space-y-4">
      <input type="hidden" name="doc_id" value={doc.id} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-gray-500">
          {doc.original_filename}
          {doc.model ? ` ・${doc.model}` : ""}
        </div>
        <div className="flex items-center gap-2">
          {doc.is_stub && (
            <span className="badge bg-gray-100 text-gray-600">AI未設定</span>
          )}
          <ConfidenceBadge value={doc.confidence} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">タイトル</label>
          <input name="title" defaultValue={doc.title ?? ""} className="input" />
        </div>
        <div>
          <label className="label">種別</label>
          <input name="doc_type" defaultValue={doc.doc_type ?? ""} className="input" />
        </div>
      </div>

      <div>
        <label className="label">コレクション</label>
        <select
          name="collection_id"
          defaultValue={doc.collection_id ?? ""}
          className="input"
        >
          <option value="">未分類</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">抽出項目</label>
        {fieldEntries.length === 0 ? (
          <p className="text-xs text-gray-400">抽出項目はありません。</p>
        ) : (
          <div className="space-y-2">
            {fieldEntries.map(([key, value]) => (
              <div key={key} className="grid grid-cols-3 gap-2">
                <span className="col-span-1 truncate py-2 text-xs text-gray-500">
                  {key}
                </span>
                <input
                  name={`field__${key}`}
                  defaultValue={value === null ? "" : String(value)}
                  className="input col-span-2"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          name="intent"
          value="save"
          className="btn-ghost"
        >
          修正を保存
        </button>
        <button
          type="submit"
          name="intent"
          value="confirm"
          className="btn-primary"
        >
          確定する
        </button>
      </div>
    </form>
  );
}
