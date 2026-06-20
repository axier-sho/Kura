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

/** Tauri rejects invokes with a plain string (or other non-Error value); read a
 *  human-readable message without assuming an `Error` shape (which would render
 *  as "undefined"). */
function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
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
  const recent = useRef<Map<string, number>>(new Map());

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
      // Collapse repeat events for one file: skip if an ingest is already in
      // flight for this path, or if we ingested it within the recent window. The
      // Rust watcher emits once a file settles, but a trailing settle/Modify for
      // the same completed file would otherwise create a duplicate document.
      const nowMs = Date.now();
      const last = recent.current.get(path);
      if (seen.current.has(path) || (last !== undefined && nowMs - last < 15_000)) {
        return;
      }
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
        addLog(`エラー: ${errorMessage(e)}`);
      } finally {
        seen.current.delete(path);
        recent.current.set(path, Date.now());
      }
    },
    [addLog],
  );

  useEffect(() => {
    const tauri = getTauri();
    if (!tauri) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    tauri.event
      .listen("kura://file-detected", (e) => {
        const path = String(e.payload);
        void ingest(path);
      })
      .then((u) => {
        // If the effect was torn down before this async subscribe resolved,
        // detach immediately so we don't leak a listener for an unmounted effect.
        if (cancelled) u();
        else unlisten = u;
      })
      .catch((err) => {
        // listen() does an IPC round-trip that can reject (with a plain string);
        // surface it instead of leaving an unhandled rejection.
        addLog(`エラー: ${errorMessage(err)}`);
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [ingest, addLog]);

  if (!isTauri) return null;

  async function pick() {
    const tauri = getTauri();
    if (!tauri) return;
    try {
      const path = await tauri.core.invoke<string | null>("pick_folder");
      if (path) setFolder(path);
    } catch (e) {
      addLog(`エラー: ${errorMessage(e)}`);
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
      addLog(`エラー: ${errorMessage(e)}`);
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
      addLog(`エラー: ${errorMessage(e)}`);
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
