"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { cx } from "./ui/cx";
import { ChevronDownIcon, GearIcon } from "./ui/icons";

const PRIMARY = [
  { href: "/", label: "ダッシュボード" },
  { href: "/organize", label: "整理" },
  { href: "/review", label: "確認待ち" },
  { href: "/search", label: "検索" },
];

const TOOLS = [
  { href: "/calendar", label: "カレンダー" },
  { href: "/templates", label: "テンプレート" },
];

function tabClass(active: boolean): string {
  return active
    ? "whitespace-nowrap rounded-md bg-kura-accentSoft px-3 py-1.5 text-sm font-medium text-kura-accent"
    : "whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-kura-accent";
}

/** A route is active when it (or one of its sub-routes) is the current path. The
 *  `/` dashboard is matched exactly so it doesn't light up on every page. */
function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function ToolsMenu({ isActive }: { isActive: (href: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const active = TOOLS.some((t) => isActive(t.href));

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx("inline-flex items-center gap-1", tabClass(active || open))}
      >
        ツール
        <ChevronDownIcon
          className={cx("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div
          role="menu"
          className="animate-dropdown-in absolute left-0 z-20 mt-1 min-w-44 rounded-md border border-gray-200 bg-white p-1 shadow-md"
        >
          {TOOLS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={cx("block w-full text-left", tabClass(isActive(t.href)))}
            >
              {t.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function Nav() {
  const isActive = useIsActive();

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-x-2 px-4 py-3">
        <Link href="/" aria-label="Kura" className="mr-2 shrink-0">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {PRIMARY.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={tabClass(isActive(l.href))}
            >
              {l.label}
            </Link>
          ))}
          <ToolsMenu isActive={isActive} />
        </nav>
        <Link
          href="/settings"
          aria-label="設定"
          title="設定"
          className={cx(
            "ml-auto rounded-md p-1.5 transition-colors",
            isActive("/settings")
              ? "bg-kura-accentSoft text-kura-accent"
              : "text-gray-500 hover:bg-gray-50 hover:text-kura-accent",
          )}
        >
          <GearIcon className="h-5 w-5" />
        </Link>
      </div>
    </header>
  );
}
