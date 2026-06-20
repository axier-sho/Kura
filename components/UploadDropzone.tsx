"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ProcessConsole, useConsoleLog } from "@/components/ProcessConsole";
import { readNdjsonStream } from "@/lib/ndjson";

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

/** Streaming progress events from POST /api/documents (NDJSON, one per line).
 *  Mirrors IngestEvent on the server; kept local so this client component never
 *  imports the server module (which pulls in node:fs and friends). */
type IngestEvent =
  | { type: "start"; total: number }
  | { type: "file-start"; index: number; total: number; filename: string }
  | {
      type: "file-done";
      index: number;
      total: number;
      result: UploadResult;
    }
  | { type: "done"; results: UploadResult[] }
  | { type: "error"; message: string };

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
  const { logs, push: pushLog, clear: clearLogs } = useConsoleLog();

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

  function handleEvent(event: IngestEvent) {
    switch (event.type) {
      case "start":
        pushLog("info", `${event.total} 件の取り込みを開始しました。`);
        break;
      case "file-start":
        pushLog(
          "info",
          `[${event.index}/${event.total}] ${event.filename} を解析中…`,
        );
        break;
      case "file-done": {
        const r = event.result;
        const head = `[${event.index}/${event.total}] ${r.filename}`;
        if (r.error) {
          pushLog("error", `${head} 失敗: ${r.error}`);
        } else if (r.cached) {
          pushLog("info", `${head} は既存(キャッシュ)`);
        } else {
          const pct =
            typeof r.confidence === "number"
              ? ` ・確信度 ${Math.round(r.confidence * 100)}%`
              : "";
          pushLog(
            "success",
            `${head} 取り込み完了${r.doc_type ? ` ・${r.doc_type}` : ""}${pct}${r.is_stub ? " ・AI未設定(スタブ)" : ""}`,
          );
        }
        break;
      }
      case "done": {
        setResults(event.results);
        setFiles([]);
        const failed = event.results.filter((r) => r.error).length;
        const cached = event.results.filter((r) => !r.error && r.cached).length;
        const ok = event.results.length - failed - cached;
        pushLog(
          failed > 0 ? "warn" : "success",
          `完了:取り込み ${ok}・既存 ${cached}・失敗 ${failed}`,
        );
        break;
      }
      case "error":
        pushLog("error", `取り込みに失敗しました: ${event.message}`);
        setError(event.message);
        break;
    }
  }

  async function submit() {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    setResults(null);
    clearLogs();
    try {
      const fd = new FormData();
      if (collectionId) fd.set("collection_id", collectionId);
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/documents", {
        method: "POST",
        // Opt into the live NDJSON progress stream (the folder-watcher omits
        // this header and still gets the legacy { results } JSON).
        headers: { Accept: "application/x-ndjson" },
        body: fd,
      });
      if (!res.ok || !res.body) {
        // An error response (413 from a proxy, HTML 5xx, …) may not be JSON;
        // guard the parse so the user sees the upload-failure message, not a
        // raw SyntaxError.
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? "アップロードに失敗しました",
        );
      }
      await readNdjsonStream<IngestEvent>(res, handleEvent);
    } catch (e) {
      pushLog("error", `アップロードに失敗しました: ${(e as Error).message}`);
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

      {(logs.length > 0 || results) && (
        <ProcessConsole
          logs={logs}
          busy={busy}
          resultLabel={results ? `結果(${results.length})` : "結果"}
          result={
            results && (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold">取り込み結果</h2>
                <ul className="space-y-2 text-sm">
                  {results.map((r, i) => (
                    <li key={i} className="rounded-md border border-gray-100 p-2">
                      <div className="flex items-center justify-between">
                        <span className="truncate font-medium">
                          {r.filename}
                        </span>
                        {r.error ? (
                          <span className="badge bg-red-100 text-kura-danger">
                            失敗
                          </span>
                        ) : r.cached ? (
                          <span className="badge bg-gray-100 text-gray-600">
                            既存(キャッシュ)
                          </span>
                        ) : (
                          <span className="badge bg-kura-accentSoft text-kura-accent">
                            取り込み完了
                          </span>
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
            )
          }
        />
      )}
    </div>
  );
}
