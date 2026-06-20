"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type LogLevel = "info" | "success" | "warn" | "error";

export interface LogLine {
  id: number;
  level: LogLevel;
  time: string;
  text: string;
}

/**
 * Append-only log buffer for a streaming run. Ids are monotonic (not array
 * indices) so clearing then re-running never reuses a React key.
 */
export function useConsoleLog() {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const idRef = useRef(0);

  const push = useCallback((level: LogLevel, text: string) => {
    setLogs((prev) => [
      ...prev,
      {
        id: idRef.current++,
        level,
        text,
        time: new Date().toLocaleTimeString(),
      },
    ]);
  }, []);

  const clear = useCallback(() => setLogs([]), []);

  return { logs, push, clear };
}

function logColor(level: LogLevel): string {
  switch (level) {
    case "success":
      return "text-emerald-300";
    case "warn":
      return "text-amber-300";
    case "error":
      return "text-red-300";
    default:
      return "text-gray-200";
  }
}

function tabClass(active: boolean): string {
  return active
    ? "rounded-md bg-kura-accentSoft px-3 py-1 text-sm font-medium text-kura-accent"
    : "rounded-md px-3 py-1 text-sm text-gray-500 hover:text-kura-accent disabled:cursor-not-allowed disabled:opacity-40";
}

/**
 * Live console for a streaming batch run: a "コンソール" tab that tails per-item
 * progress lines plus an optional "結果" tab hosting a caller-supplied summary.
 * Used by the organize panel so the user can always tell whether work is
 * progressing or has failed.
 */
export function ProcessConsole({
  logs,
  busy,
  result,
  resultLabel = "結果",
}: {
  logs: LogLine[];
  busy: boolean;
  /** Result-tab content; when omitted the result tab stays disabled. */
  result?: ReactNode;
  resultLabel?: string;
}) {
  const [tab, setTab] = useState<"console" | "result">("console");
  const boxRef = useRef<HTMLDivElement>(null);
  const hasResult = result != null;

  // Keep the console pinned to the newest line as it streams in.
  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <section className="card space-y-3">
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => setTab("console")}
          className={tabClass(tab === "console")}
        >
          コンソール
        </button>
        <button
          onClick={() => setTab("result")}
          disabled={!hasResult}
          className={tabClass(tab === "result")}
        >
          {resultLabel}
        </button>
        {busy && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-kura-accent" />
            実行中…
          </span>
        )}
      </div>

      {/* During a run `result` is cleared, so fall back to the console even if
          the result tab was left active from a previous run. */}
      {tab === "result" && hasResult ? (
        result
      ) : (
        <div
          ref={boxRef}
          className="h-64 overflow-auto rounded-md bg-gray-900 p-3 font-mono text-xs leading-relaxed"
        >
          {logs.length === 0 ? (
            <p className="text-gray-500">ログはまだありません。</p>
          ) : (
            logs.map((l) => (
              <div key={l.id} className="break-all whitespace-pre-wrap">
                <span className="text-gray-500">{l.time} </span>
                <span className={logColor(l.level)}>{l.text}</span>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
