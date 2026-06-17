"use client";

import { useState } from "react";

export function DraftGenerator({
  templates,
  documents,
}: {
  templates: { id: string; name: string }[];
  documents: { id: string; title: string | null; original_filename: string | null }[];
}) {
  const [templateId, setTemplateId] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!templateId || !documentId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, documentId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "生成に失敗しました");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "draft.docx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3">
      <h2 className="text-sm font-semibold">ドラフト生成</h2>
      <p className="text-xs text-gray-500">
        テンプレートの差し込み欄に、選んだ書類の抽出項目を流し込んで .docx を生成します(確定は人が行います)。
      </p>
      <div>
        <label className="label">テンプレート</label>
        <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">選択してください</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">差し込む書類(確定済み)</label>
        <select className="input" value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
          <option value="">選択してください</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title ?? d.original_filename ?? d.id}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-kura-danger">{error}</p>}
      <button onClick={generate} disabled={busy || !templateId || !documentId} className="btn-primary w-full">
        {busy ? "生成中…" : ".docx を生成してダウンロード"}
      </button>
    </div>
  );
}
