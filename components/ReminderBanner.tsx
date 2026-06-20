import Link from "next/link";
import type { EventWithDoc } from "@/lib/db/repositories/events";

function daysUntil(date: string): number | null {
  // Calendar-day delta against the LOCAL today (see app/calendar/page.tsx).
  // Returns null for an unparseable date so the UI suppresses the day count
  // rather than rendering "あとNaN日".
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return null;
  const n = new Date();
  const today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((t - today) / 86_400_000);
}

/**
 * Active reminder surface: overdue + due-soon events, shown when the app is
 * opened so the user is actually prompted about approaching due dates instead of
 * having to remember to visit the calendar. (Background OS notifications while
 * the app is closed would additionally need the Tauri notification plugin.)
 */
export function ReminderBanner({ events }: { events: EventWithDoc[] }) {
  if (events.length === 0) return null;
  const overdue = events.filter((e) => {
    const d = e.due_date ? daysUntil(e.due_date) : null;
    return d !== null && d < 0;
  }).length;

  return (
    <div className="card border-amber-300 bg-amber-50">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-amber-900">
          期限が近い書類が {events.length} 件あります
          {overdue > 0 ? `(うち ${overdue} 件は期限超過)` : ""}
        </h2>
        <Link
          href="/calendar"
          className="shrink-0 text-sm text-kura-accent hover:underline"
        >
          カレンダーへ →
        </Link>
      </div>
      <ul className="space-y-1 text-sm">
        {events.slice(0, 5).map((e) => {
          const d = e.due_date ? daysUntil(e.due_date) : null;
          const over = d !== null && d < 0;
          return (
            <li key={e.id} className="flex items-center justify-between gap-3">
              <span className="truncate">
                {e.event_type}
                {e.documents?.title ? ` ・${e.documents.title}` : ""}
              </span>
              <span
                className={`shrink-0 text-xs ${over ? "text-kura-danger" : "text-kura-warn"}`}
              >
                {e.due_date}
                {d !== null ? `(${over ? `${-d}日超過` : `あと${d}日`})` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
