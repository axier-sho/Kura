"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ProcessConsole, useConsoleLog } from "@/components/ProcessConsole";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { readNdjsonStream } from "@/lib/ndjson";

interface OrganizeFileResult {
  filename: string;
  action: "moved" | "held" | "error";
  folder?: string;
  isNew?: boolean;
  confidence?: number;
  error?: string;
}

interface OrganizeRunResult {
  runId: string | null;
  processed: number;
  moved: number;
  held: number;
  errors: number;
  results: OrganizeFileResult[];
}

/** A past organize run, as shown in the history list. Mirrors the server row
 *  minus the move-log (the client only needs the summary + instruction text). */
interface OrganizeRunSummary {
  id: string;
  created_at: string;
  instruction: string | null;
  feedback: string | null;
  processed: number;
  moved: number;
  held: number;
  errors: number;
  undone: boolean;
}

/** Streaming progress events from POST /api/organize (NDJSON, one per line).
 *  Mirrors OrganizeEvent on the server; kept local so this client component
 *  never imports the server module (which pulls in node:fs). */
type OrganizeEvent =
  | { type: "start"; total: number; workingDir: string }
  | { type: "file-start"; index: number; total: number; filename: string }
  | { type: "file-skip"; index: number; total: number; filename: string }
  | {
      type: "file-done";
      index: number;
      total: number;
      result: OrganizeFileResult;
    }
  | { type: "done"; summary: OrganizeRunResult }
  | { type: "error"; message: string };

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

/** Tauri rejects invokes with a plain string (or other non-Error value); read a
 *  human-readable message without assuming an `Error` shape. */
function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export function OrganizePanel({
  initialWorkingDir,
  initialInboxCount,
  initialCategories,
  initialHistory,
  initialUndoableRunId,
}: {
  initialWorkingDir: string | null;
  initialInboxCount: number;
  initialCategories: string[];
  initialHistory: OrganizeRunSummary[];
  initialUndoableRunId: string | null;
}) {
  const [workingDir, setWorkingDir] = useState(initialWorkingDir ?? "");
  const [savedDir, setSavedDir] = useState(initialWorkingDir);
  const [inboxCount, setInboxCount] = useState(initialInboxCount);
  const [categories, setCategories] = useState(initialCategories);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<OrganizeRunResult | null>(null);
  const [isTauri, setIsTauri] = useState(false);
  // 整理開始前の指示。毎回リセット(空欄起動)で、履歴に記録される。
  const [instruction, setInstruction] = useState("");
  // 結果が悪かったときの改善点。指示に追記して整理し直す。
  const [feedback, setFeedback] = useState("");
  const [history, setHistory] = useState<OrganizeRunSummary[]>(initialHistory);
  const [undoableRunId, setUndoableRunId] = useState<string | null>(
    initialUndoableRunId,
  );
  const { logs, push: pushLog, clear: clearLogs } = useConsoleLog();
  const toast = useToast();

  useEffect(() => {
    // window.__TAURI__ is absent during SSR; detect after mount so the first
    // client render matches the server (isTauri=false) and avoids a hydration
    // mismatch in the desktop build.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsTauri(getTauri() !== null);
  }, []);

  async function refresh() {
    const res = await fetch("/api/organize");
    if (!res.ok) return;
    const data = await res.json();
    if (data.workingDir) {
      setInboxCount(data.inboxCount ?? 0);
      setCategories(data.categories ?? []);
      setHistory(data.history ?? []);
      setUndoableRunId(data.undoableRunId ?? null);
    }
  }

  async function pickFolder() {
    const tauri = getTauri();
    if (!tauri) return;
    setError(null);
    try {
      const path = await tauri.core.invoke<string | null>("pick_folder");
      if (path) setWorkingDir(path);
    } catch (e) {
      // Tauri rejects invokes with a plain string, not an Error, so reading
      // `.message` would show "undefined". Surface the real message instead.
      setError(`フォルダの選択に失敗しました: ${errorMessage(e)}`);
    }
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
      toast.success("ワーキングディレクトリを保存しました");
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleEvent(event: OrganizeEvent) {
    switch (event.type) {
      case "start":
        pushLog("info", `受信箱 ${event.total} 件の整理を開始しました。`);
        break;
      case "file-start":
        pushLog(
          "info",
          `[${event.index}/${event.total}] ${event.filename} を解析中…`,
        );
        break;
      case "file-skip":
        pushLog(
          "info",
          `[${event.index}/${event.total}] ${event.filename} は確認済みのためスキップしました。`,
        );
        break;
      case "file-done": {
        const r = event.result;
        const head = `[${event.index}/${event.total}] ${r.filename}`;
        if (r.action === "moved") {
          const pct =
            typeof r.confidence === "number"
              ? ` (${Math.round(r.confidence * 100)}%)`
              : "";
          pushLog(
            "success",
            `${head} → ${r.folder}${r.isNew ? "(新規)" : ""} に移動${pct}`,
          );
        } else if (r.action === "held") {
          pushLog(
            "warn",
            `${head} を確認待ちに保留${r.folder ? ` (提案: ${r.folder})` : ""}`,
          );
        } else {
          pushLog("error", `${head} でエラー: ${r.error ?? "不明なエラー"}`);
        }
        break;
      }
      case "done": {
        setRun(event.summary);
        const { processed, moved, held, errors } = event.summary;
        const summary = `完了:処理 ${processed} 件(移動 ${moved}・保留 ${held}・エラー ${errors})`;
        pushLog(errors > 0 ? "warn" : "success", summary);
        if (errors > 0) toast.warn(summary);
        else toast.success(`整理が完了しました(移動 ${moved}・保留 ${held})`);
        break;
      }
      case "error":
        pushLog("error", `整理に失敗しました: ${event.message}`);
        setError(event.message);
        toast.error(`整理に失敗しました: ${event.message}`);
        break;
    }
  }

  async function organize(overrideInstruction?: string, fb?: string) {
    setBusy(true);
    setError(null);
    setRun(null);
    clearLogs();
    try {
      const res = await fetch("/api/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: overrideInstruction ?? instruction,
          feedback: fb,
        }),
      });
      if (!res.ok || !res.body) {
        // Setup errors (e.g. no working dir) come back as JSON, not a stream.
        let msg = "整理に失敗しました";
        try {
          const data = await res.json();
          msg = data.error ?? msg;
        } catch {
          // Non-JSON body; keep the default message.
        }
        throw new Error(msg);
      }
      await readNdjsonStream<OrganizeEvent>(res, handleEvent);
    } catch (e) {
      pushLog("error", `整理に失敗しました: ${errorMessage(e)}`);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  /** Undo a previous run's auto-moves (back to the inbox). Returns true on ok. */
  async function undoRun(runId: string): Promise<boolean> {
    const res = await fetch("/api/organize/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      restored?: number;
      skipped?: number;
      errors?: string[];
      error?: string;
    };
    if (!res.ok) throw new Error(data.error ?? "元に戻すのに失敗しました");
    pushLog(
      "info",
      `元に戻しました(受信箱へ ${data.restored ?? 0} 件 / スキップ ${data.skipped ?? 0} 件)`,
    );
    (data.errors ?? []).forEach((m) => pushLog("error", `元に戻す: ${m}`));
    return true;
  }

  /** Standalone "元に戻す": revert the latest undoable run, no re-run. */
  async function undoLast() {
    if (!undoableRunId) return;
    setBusy(true);
    setError(null);
    try {
      await undoRun(undoableRunId);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  /** Append the feedback to the instruction, undo the last run, and re-organize
   *  so the moved-back files are re-routed under the corrected instruction. */
  async function applyFeedbackAndRerun() {
    const add = feedback.trim();
    if (!add) return;
    const merged = instruction.trim() ? `${instruction.trim()}\n${add}` : add;
    setBusy(true);
    setError(null);
    try {
      if (undoableRunId) await undoRun(undoableRunId);
    } catch (e) {
      // Surface but continue: the re-run still applies the improved instruction
      // to whatever remains in the inbox.
      pushLog("error", `元に戻す: ${errorMessage(e)}`);
    } finally {
      setBusy(false);
    }
    setInstruction(merged);
    setFeedback("");
    await organize(merged, add);
  }

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
            <Button variant="ghost" onClick={pickFolder} className="text-sm">
              フォルダを選択
            </Button>
          )}
          <Button
            onClick={saveDir}
            disabled={busy || !workingDir}
            className="text-sm"
          >
            保存
          </Button>
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
          <div>
            <label className="label" htmlFor="organize-instruction">
              整理の指示(任意)
            </label>
            <textarea
              id="organize-instruction"
              className="input min-h-[72px] w-full"
              placeholder="例: 請求書は取引先名でフォルダ分けして。領収書はまとめて『経費』に。"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              maxLength={2000}
              disabled={busy}
            />
            <p className="text-xs text-gray-400">
              AI がフォルダを決めるとき、この指示を最優先で守ります。設定の職業・カスタム指示も併せて適用されます。入力内容は履歴に残ります。
            </p>
          </div>
          <Button
            onClick={() => organize()}
            loading={busy}
            disabled={inboxCount === 0}
            className="w-full"
          >
            {busy ? "整理中…" : "整理する"}
          </Button>
          {inboxCount === 0 && (
            <p className="text-xs text-gray-400">
              受信箱が空です。<code>_inbox</code>{" "}
              フォルダにファイルを入れてください。
            </p>
          )}
        </section>
      )}

      {error && <p className="text-sm text-kura-danger">{error}</p>}

      {(logs.length > 0 || run) && (
        <ProcessConsole
          logs={logs}
          busy={busy}
          resultLabel={run ? `結果(${run.processed})` : "結果"}
          result={
            run && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold">
                  整理結果(処理 {run.processed} 件 / 移動 {run.moved} ・保留{" "}
                  {run.held} ・エラー {run.errors})
                </h2>

                {moved.length > 0 && (
                  <div>
                    <p className="label">移動済み</p>
                    <ul className="space-y-1 text-sm">
                      {moved.map((r, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between gap-2"
                        >
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
                        <li
                          key={i}
                          className="flex items-center justify-between gap-2"
                        >
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

                <div className="space-y-2 border-t pt-3">
                  <label className="label" htmlFor="organize-feedback">
                    整理結果の改善点(AI へのフィードバック)
                  </label>
                  <textarea
                    id="organize-feedback"
                    className="input min-h-[60px] w-full"
                    placeholder="例: 領収書は『経費』にまとめて。請求書は取引先ごとに分けて。"
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    maxLength={2000}
                    disabled={busy}
                  />
                  <button
                    className="btn-primary w-full"
                    disabled={busy || !feedback.trim()}
                    onClick={applyFeedbackAndRerun}
                  >
                    改善点を反映して整理し直す
                  </button>
                  {undoableRunId && (
                    <button
                      className="btn-ghost w-full text-sm"
                      disabled={busy}
                      onClick={undoLast}
                    >
                      前回の整理を元に戻す(受信箱へ戻す)
                    </button>
                  )}
                  <p className="text-xs text-gray-400">
                    前回移動したファイルを受信箱に戻してから、改善点を反映して整理し直します。確認待ちで確定済みのファイルは戻りません。
                  </p>
                </div>
              </div>
            )
          }
        />
      )}

      {savedDir && history.length > 0 && (
        <section className="card space-y-3">
          <h2 className="text-sm font-semibold">整理の履歴</h2>
          <ul className="space-y-2">
            {history.map((h) => (
              <li
                key={h.id}
                className="space-y-1 border-b border-gray-100 pb-2 last:border-0 last:pb-0"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                  <span>{new Date(h.created_at).toLocaleString("ja-JP")}</span>
                  <span>
                    移動 {h.moved}・保留 {h.held}・エラー {h.errors}
                    {h.undone ? "・取消済み" : ""}
                  </span>
                </div>
                <p className="text-sm">
                  {h.instruction ? (
                    h.instruction
                  ) : (
                    <span className="text-gray-400">指示なし</span>
                  )}
                </p>
                {h.instruction && (
                  <button
                    className="text-xs text-kura-accent hover:underline"
                    disabled={busy}
                    onClick={() => setInstruction(h.instruction ?? "")}
                  >
                    この指示を再利用
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
