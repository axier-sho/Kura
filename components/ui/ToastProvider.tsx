"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "./cx";
import { AlertIcon, CheckIcon, InfoIcon, XIcon } from "./icons";

export type ToastKind = "success" | "error" | "info" | "warn";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastOptions {
  kind?: ToastKind;
  /** Auto-dismiss delay in ms (default 4000). */
  duration?: number;
}

interface ToastApi {
  toast: (message: string, opts?: ToastOptions) => void;
  success: (message: string, opts?: Omit<ToastOptions, "kind">) => void;
  error: (message: string, opts?: Omit<ToastOptions, "kind">) => void;
  info: (message: string, opts?: Omit<ToastOptions, "kind">) => void;
  warn: (message: string, opts?: Omit<ToastOptions, "kind">) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const KIND_CLASS: Record<ToastKind, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-red-200 bg-red-50 text-kura-danger",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-gray-200 bg-white text-kura-ink",
};

function KindIcon({ kind }: { kind: ToastKind }) {
  const cls = "h-4 w-4 shrink-0";
  if (kind === "success") return <CheckIcon className={cx(cls, "text-kura-accent")} />;
  if (kind === "error") return <AlertIcon className={cls} />;
  if (kind === "warn") return <AlertIcon className={cls} />;
  return <InfoIcon className={cls} />;
}

/**
 * Toast provider mounted once in the root layout, wrapping the (server-rendered)
 * page tree. `children` always render; only the fixed viewport is portaled to
 * document.body and gated behind a mounted flag, since pages are `force-dynamic`
 * and `document` is undefined during SSR.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);
  const idRef = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    // Portal target (document.body) only exists after mount; flipping this flag
    // post-mount keeps the first client render matching the SSR output (no
    // portal) and avoids a hydration mismatch on these force-dynamic pages.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const pending = timers.current;
    return () => {
      pending.forEach((t) => clearTimeout(t));
      pending.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message: string, opts?: ToastOptions) => {
      const id = idRef.current++;
      const kind = opts?.kind ?? "info";
      setToasts((prev) => [...prev, { id, kind, message }]);
      const timer = setTimeout(() => dismiss(id), opts?.duration ?? 4000);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast: push,
      success: (m, o) => push(m, { ...o, kind: "success" }),
      error: (m, o) => push(m, { ...o, kind: "error" }),
      info: (m, o) => push(m, { ...o, kind: "info" }),
      warn: (m, o) => push(m, { ...o, kind: "warn" }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
            {toasts.map((t) => (
              <div
                key={t.id}
                role={t.kind === "error" ? "alert" : "status"}
                aria-live={t.kind === "error" ? "assertive" : "polite"}
                className={cx(
                  "pointer-events-auto flex items-start gap-2 rounded-lg border p-3 text-sm shadow-md animate-toast-in",
                  KIND_CLASS[t.kind],
                )}
              >
                <KindIcon kind={t.kind} />
                <span className="flex-1 break-words">{t.message}</span>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="閉じる"
                  className="shrink-0 rounded p-0.5 opacity-60 transition hover:bg-black/5 hover:opacity-100"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
