"use client";

import { useRef, useState } from "react";
import Link from "next/link";

// Keep in sync with app/api/documents/route.ts and the desktop read_file cap.
const MAX_UPLOAD_BYTES = 64 * 1024 * 1024; // 64 MB

interface UploadResult {
  filename: string;
  documentId?: string;
  cached?: boolean;
  doc_type?: string;
  title?: string;
  confidence?: number;
  is_stub?: boolean;
  error?: string;
}

export function UploadDropzone({
  collections,
}: {
  collections: { id: string; name: string }[];
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [collectionId, setCollectionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<UploadResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const tooBig = incoming.filter((f) => f.size > MAX_UPLOAD_BYTES);
    const ok = incoming.filter((f) => f.size <= MAX_UPLOAD_BYTES);
    if (tooBig.length > 0) {
      setError(
        `次のファイルは大きすぎます(上限 ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB): ${tooBig
          .map((f) => f.name)
          .join("、")}`,
      );
    }
    if (ok.length > 0) setFiles((prev) => [...prev, ...ok]);
  }

  async function submit() {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const fd = new FormData();
      if (collectionId) fd.set("collection_id", collectionId);
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/documents", { method: "POST", body: fd });
      if (!res.ok) {
        // An error response (413 from a proxy, HTML 5xx, …) may not be JSON;
        // guard the parse so the user sees the upload-failure message, not a
        // raw SyntaxError.
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? "アップロードに失敗しました",
        );
      }
      const data = await res.json();
      setResults(data.results as UploadResult[]);
      setFiles([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className="card cursor-pointer border-2 border-dashed border-gray-300 text-center hover:border-kura-accent"
      >
        <p className="text-sm text-gray-600">
          ここにファイルをドラッグ&ドロップ、またはクリックして選択
        </p>
        <p className="mt-1 text-xs text-gray-400">PDF / PNG / JPG / DOCX / TXT</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt,.md,.csv"
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="card space-y-3">
          <ul className="space-y-1 text-sm">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between">
                <span className="truncate">{f.name}</span>
                <button
                  className="text-xs text-gray-400 hover:text-kura-danger"
                  onClick={() =>
                    setFiles((prev) => prev.filter((_, idx) => idx !== i))
                  }
                >
                  削除
                </button>
              </li>
            ))}
          </ul>

          <div>
            <label className="label">コレクション(任意)</label>
            <select
              className="input"
              value={collectionId}
              onChange={(e) => setCollectionId(e.target.value)}
            >
              <option value="">未分類</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <button onClick={submit} disabled={busy} className="btn-primary w-full">
            {busy ? "解析中…" : `${files.length} 件を取り込む`}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-kura-danger">{error}</p>}

      {results && (
        <div className="card space-y-2">
          <h2 className="text-sm font-semibold">取り込み結果</h2>
          <ul className="space-y-2 text-sm">
            {results.map((r, i) => (
              <li key={i} className="rounded-md border border-gray-100 p-2">
                <div className="flex items-center justify-between">
                  <span className="truncate font-medium">{r.filename}</span>
                  {r.error ? (
                    <span className="badge bg-red-100 text-kura-danger">失敗</span>
                  ) : r.cached ? (
                    <span className="badge bg-gray-100 text-gray-600">既存(キャッシュ)</span>
                  ) : (
                    <span className="badge bg-kura-accentSoft text-kura-accent">取り込み完了</span>
                  )}
                </div>
                {r.error ? (
                  <p className="text-xs text-kura-danger">{r.error}</p>
                ) : (
                  <p className="text-xs text-gray-500">
                    {r.doc_type}
                    {typeof r.confidence === "number"
                      ? ` ・確信度 ${(r.confidence * 100).toFixed(0)}%`
                      : ""}
                    {r.is_stub ? " ・AI未設定(スタブ)" : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <Link href="/review" className="btn-ghost w-full">
            確認待ちで内容を確定する →
          </Link>
        </div>
      )}
    </div>
  );
}
