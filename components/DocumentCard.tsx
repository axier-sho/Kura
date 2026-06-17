import Link from "next/link";
import type { DocumentRow } from "@/lib/db/types";

const statusLabel: Record<DocumentRow["status"], string> = {
  pending: "処理中",
  needs_review: "確認待ち",
  confirmed: "確定",
};

const statusCls: Record<DocumentRow["status"], string> = {
  pending: "bg-gray-100 text-gray-600",
  needs_review: "bg-amber-100 text-kura-warn",
  confirmed: "bg-kura-accentSoft text-kura-accent",
};

export function DocumentCard({ doc }: { doc: DocumentRow }) {
  const fields = Object.entries(doc.extracted_fields ?? {}).slice(0, 4);
  return (
    <div className="card space-y-2">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{doc.title ?? doc.original_filename}</h3>
        <span className={`badge ${statusCls[doc.status]}`}>
          {statusLabel[doc.status]}
        </span>
      </div>
      <div className="flex flex-wrap gap-1 text-xs">
        {doc.doc_type && (
          <span className="badge bg-gray-100 text-gray-600">{doc.doc_type}</span>
        )}
        {typeof doc.confidence === "number" && (
          <span className="badge bg-gray-100 text-gray-500">
            確信度 {Math.round(doc.confidence * 100)}%
          </span>
        )}
      </div>
      {fields.length > 0 && (
        <dl className="space-y-0.5 text-xs text-gray-600">
          {fields.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="shrink-0 text-gray-400">{k}</dt>
              <dd className="truncate">{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {doc.storage_path && (
        <Link
          href={`/api/files/${doc.id}`}
          className="inline-block text-xs text-kura-accent hover:underline"
          prefetch={false}
        >
          元ファイルを開く →
        </Link>
      )}
    </div>
  );
}
