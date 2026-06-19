"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Desktop-only panel (Tauri). Lets the user pick a local folder; the Rust shell
 * watches it and emits "kura://file-detected" on new/changed files. Here we read
 * each file via the `read_file` command and POST it to the same /api/documents
 * ingest endpoint (which persists to the local database).
 *
 * Renders nothing on the web (window.__TAURI__ is absent).
 */

interface TauriGlobal {
  core: { invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T> };
  event: {
    listen: (
      event: string,
      cb: (e: { payload: unknown }) => void,
    ) => Promise<() => void>;
  };
}

function getTauri(): TauriGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__ ?? null;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function FolderWatchSettings() {
  const [isTauri, setIsTauri] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Client-only capability check: window.__TAURI__ is undefined during SSR,
    // so we must detect after mount (a lazy initial state would mismatch on
    // hydration). This is the intended "subscribe to an external system" use.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsTauri(getTauri() !== null);
  }, []);

  const addLog = useCallback((line: string) => {
    setLog((prev) => [`${new Date().toLocaleTimeString()} ${line}`, ...prev].slice(0, 20));
  }, []);

  const ingest = useCallback(
    async (path: string) => {
      const tauri = getTauri();
      if (!tauri) return;
      // Dedupe only while a path is in flight (the watcher can fire several
      // events for one write). A later "changed" event for the same path is
      // re-ingested once processing completes.
      if (seen.current.has(path)) return;
      seen.current.add(path);
      try {
        const file = await tauri.core.invoke<{ name: string; data: string }>(
          "read_file",
          { path },
        );
        const bytes = base64ToBytes(file.data);
        const blob = new File([bytes as BlobPart], file.name);
        const fd = new FormData();
        fd.append("files", blob);
        const res = await fetch("/api/documents", { method: "POST", body: fd });
        // /api/documents returns 200 with a per-file `error` when the pipeline
        // fails, so res.ok alone would log a failed ingest as success.
        const body = (await res.json().catch(() => null)) as
          | { results?: Array<{ error?: string }> }
          | null;
        const fileError = body?.results?.[0]?.error;
        if (!res.ok || fileError) {
          addLog(`失敗: ${file.name}${fileError ? ` (${fileError})` : ""}`);
        } else {
          addLog(`取り込み: ${file.name}`);
        }
      } catch (e) {
        addLog(`エラー: ${(e as Error).message}`);
      } finally {
        seen.current.delete(path);
      }
    },
    [addLog],
  );

  useEffect(() => {
    const tauri = getTauri();
    if (!tauri) return;
    let unlisten: (() => void) | undefined;
    tauri.event
      .listen("kura://file-detected", (e) => {
        const path = String(e.payload);
        void ingest(path);
      })
      .then((u) => {
        unlisten = u;
      });
    return () => unlisten?.();
  }, [ingest]);

  if (!isTauri) return null;

  async function pick() {
    const tauri = getTauri();
    if (!tauri) return;
    try {
      const path = await tauri.core.invoke<string | null>("pick_folder");
      if (path) setFolder(path);
    } catch (e) {
      addLog(`エラー: ${(e as Error).message}`);
    }
  }

  async function start() {
    const tauri = getTauri();
    if (!tauri || !folder) return;
    try {
      await tauri.core.invoke("start_watch", { path: folder });
      setWatching(true);
      addLog(`監視開始: ${folder}`);
    } catch (e) {
      // A rejected invoke (folder removed, no read permission) must surface to
      // the user, not become an unhandled rejection that silently leaves the UI
      // showing the wrong watch state.
      addLog(`エラー: ${(e as Error).message}`);
    }
  }

  async function stop() {
    const tauri = getTauri();
    if (!tauri) return;
    try {
      await tauri.core.invoke("stop_watch");
      setWatching(false);
      addLog("監視停止");
    } catch (e) {
      addLog(`エラー: ${(e as Error).message}`);
    }
  }

  return (
    <section className="card space-y-3">
      <h2 className="text-sm font-semibold">フォルダ自動取り込み(デスクトップ)</h2>
      <p className="text-xs text-gray-500">
        指定したフォルダを監視し、追加されたファイルを自動で取り込みます。
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={pick} className="btn-ghost text-sm">
          フォルダを選択
        </button>
        {folder && <span className="truncate text-xs text-gray-600">{folder}</span>}
      </div>
      <div className="flex gap-2">
        <button onClick={start} disabled={!folder || watching} className="btn-primary text-sm">
          監視開始
        </button>
        <button onClick={stop} disabled={!watching} className="btn-ghost text-sm">
          停止
        </button>
      </div>
      {log.length > 0 && (
        <ul className="space-y-0.5 text-xs text-gray-500">
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
