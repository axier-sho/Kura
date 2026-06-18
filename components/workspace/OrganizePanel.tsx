"use client";

import { useState } from "react";
import Link from "next/link";

interface OrganizeFileResult {
  filename: string;
  action: "moved" | "held" | "error";
  folder?: string;
  isNew?: boolean;
  confidence?: number;
  error?: string;
}

interface OrganizeRunResult {
  processed: number;
  moved: number;
  held: number;
  errors: number;
  results: OrganizeFileResult[];
}

interface TauriGlobal {
  core: {
    invoke: <T = unknown>(
      cmd: string,
      args?: Record<string, unknown>,
    ) => Promise<T>;
  };
}

function getTauri(): TauriGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__ ?? null;
}

export function OrganizePanel({
  initialWorkingDir,
  initialInboxCount,
  initialCategories,
}: {
  initialWorkingDir: string | null;
  initialInboxCount: number;
  initialCategories: string[];
}) {
  const [workingDir, setWorkingDir] = useState(initialWorkingDir ?? "");
  const [savedDir, setSavedDir] = useState(initialWorkingDir);
  const [inboxCount, setInboxCount] = useState(initialInboxCount);
  const [categories, setCategories] = useState(initialCategories);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<OrganizeRunResult | null>(null);

  async function refresh() {
    const res = await fetch("/api/organize");
    if (!res.ok) return;
    const data = await res.json();
    if (data.workingDir) {
      setInboxCount(data.inboxCount ?? 0);
      setCategories(data.categories ?? []);
    }
  }

  async function pickFolder() {
    const tauri = getTauri();
    if (!tauri) return;
    const path = await tauri.core.invoke<string | null>("pick_folder");
    if (path) setWorkingDir(path);
  }

  async function saveDir() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: workingDir }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました");
      setSavedDir(data.workingDir);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function organize() {
    setBusy(true);
    setError(null);
    setRun(null);
    try {
      const res = await fetch("/api/organize", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "整理に失敗しました");
      setRun(data as OrganizeRunResult);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const isTauri = getTauri() !== null;
  const moved = run?.results.filter((r) => r.action === "moved") ?? [];
  const held = run?.results.filter((r) => r.action === "held") ?? [];
  const errors = run?.results.filter((r) => r.action === "error") ?? [];

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <h2 className="text-sm font-semibold">ワーキングディレクトリ</h2>
        <p className="text-xs text-gray-500">
          このフォルダの中だけで整理します。直下に <code>_inbox</code>{" "}
          フォルダが作られ、そこに入れたファイルを既存サブフォルダへ振り分けます。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input flex-1"
            placeholder="例: /home/user/書類 または C:\\Users\\me\\書類"
            value={workingDir}
            onChange={(e) => setWorkingDir(e.target.value)}
          />
          {isTauri && (
            <button onClick={pickFolder} className="btn-ghost text-sm">
              フォルダを選択
            </button>
          )}
          <button
            onClick={saveDir}
            disabled={busy || !workingDir}
            className="btn-primary text-sm"
          >
            保存
          </button>
        </div>
        {savedDir && (
          <p className="text-xs text-gray-600">
            現在のワーキングディレクトリ:{" "}
            <span className="font-mono">{savedDir}</span>
          </p>
        )}
      </section>

      {savedDir && (
        <section className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">整理</h2>
            <span className="badge bg-kura-accentSoft text-kura-accent">
              受信箱 {inboxCount} 件
            </span>
          </div>
          <div className="text-xs text-gray-500">
            既存フォルダ:{" "}
            {categories.length === 0
              ? "(なし)"
              : categories.map((c) => (
                  <span key={c} className="mr-1 font-mono">
                    {c}
                  </span>
                ))}
          </div>
          <button
            onClick={organize}
            disabled={busy || inboxCount === 0}
            className="btn-primary w-full"
          >
            {busy ? "整理中…" : "整理する"}
          </button>
          {inboxCount === 0 && (
            <p className="text-xs text-gray-400">
              受信箱が空です。<code>_inbox</code>{" "}
              フォルダにファイルを入れてください。
            </p>
          )}
        </section>
      )}

      {error && <p className="text-sm text-kura-danger">{error}</p>}

      {run && (
        <section className="card space-y-3">
          <h2 className="text-sm font-semibold">
            整理結果(処理 {run.processed} 件 / 移動 {run.moved} ・保留 {run.held}{" "}
            ・エラー {run.errors})
          </h2>

          {moved.length > 0 && (
            <div>
              <p className="label">移動済み</p>
              <ul className="space-y-1 text-sm">
                {moved.map((r, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span className="truncate">{r.filename}</span>
                    <span className="text-xs text-gray-500">
                      → {r.folder}
                      {r.isNew ? "(新規)" : ""}
                      {typeof r.confidence === "number"
                        ? ` ・${Math.round(r.confidence * 100)}%`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {held.length > 0 && (
            <div>
              <p className="label">確認待ちに保留</p>
              <ul className="space-y-1 text-sm">
                {held.map((r, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span className="truncate">{r.filename}</span>
                    <span className="text-xs text-gray-500">
                      {r.folder ? `提案: ${r.folder}` : "該当なし"}
                    </span>
                  </li>
                ))}
              </ul>
              <Link href="/review" className="btn-ghost mt-2 w-full">
                確認待ちで振り分けを確定する →
              </Link>
            </div>
          )}

          {errors.length > 0 && (
            <div>
              <p className="label">エラー</p>
              <ul className="space-y-1 text-sm text-kura-danger">
                {errors.map((r, i) => (
                  <li key={i}>
                    {r.filename}: {r.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
