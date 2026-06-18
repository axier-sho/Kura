import Link from "next/link";
import { Logo } from "./Logo";

const links = [
  { href: "/", label: "ダッシュボード" },
  { href: "/upload", label: "取り込み" },
  { href: "/review", label: "確認待ち" },
  { href: "/collections", label: "コレクション" },
  { href: "/search", label: "検索" },
  { href: "/calendar", label: "カレンダー" },
  { href: "/templates", label: "テンプレート" },
  { href: "/settings", label: "設定" },
];

export function Nav({ email }: { email?: string | null }) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" aria-label="Kura" className="shrink-0">
          <Logo />
        </Link>
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-gray-600 hover:text-kura-accent"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
          {email ? (
            <>
              <span className="hidden sm:inline">{email}</span>
              <form action="/auth/signout" method="post">
                <button className="text-gray-600 hover:text-kura-danger" type="submit">
                  ログアウト
                </button>
              </form>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
