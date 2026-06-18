"use client";

import { useState } from "react";
import { DocumentCard } from "@/components/DocumentCard";
import type { DocumentRow } from "@/lib/db/types";

export function SearchBox({
  collections,
  geminiEnabled,
}: {
  collections: { id: string; name: string }[];
  geminiEnabled: boolean;
}) {
  const [q, setQ] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [semanticUsed, setSemanticUsed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q, collectionId: collectionId || undefined }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "検索に失敗しました。");
      }
      const data = await res.json();
      setDocs((data.documents as DocumentRow[]) ?? []);
      setSemanticUsed(Boolean(data.semanticUsed));
    } catch (err) {
      setError((err as Error).message);
      setDocs(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={run} className="card flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <label className="label">キーワード / あいまいな言葉</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="input"
            placeholder={geminiEnabled ? "例: 来月更新の契約、A社の請求" : "タイトル・種別で検索"}
          />
        </div>
        <div>
          <label className="label">コレクション</label>
          <select
            value={collectionId}
            onChange={(e) => setCollectionId(e.target.value)}
            className="input min-w-40"
          >
            <option value="">すべて</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "検索中…" : "検索"}
        </button>
      </form>

      {!geminiEnabled && (
        <p className="text-xs text-gray-500">
          ※ Gemini 未設定のため、意味検索は無効です(構造化検索のみ動作します)。
        </p>
      )}

      {error && <p className="text-sm text-kura-danger">{error}</p>}

      {docs && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            {docs.length} 件
            {semanticUsed ? "(意味検索 + 構造化検索)" : "(構造化検索)"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {docs.map((d) => (
              <DocumentCard key={d.id} doc={d} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
