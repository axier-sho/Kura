import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { CalendarIcon } from "@/components/ui/icons";
import { updateEventStatus } from "./actions";
import * as eventsRepo from "@/lib/db/repositories/events";

export const dynamic = "force-dynamic";

function daysUntil(date: string): number {
  // Calendar-day delta. "today" must be the LOCAL date: deriving it from
  // toISOString() uses the UTC date, which for JST users between 00:00–09:00 is
  // still yesterday, skewing the count (and the overdue/warning styling) by one.
  // Date.UTC(local Y/M/D) and a "YYYY-MM-DD" string both parse to UTC midnight,
  // so the subtraction is a pure day difference.
  const n = new Date();
  const today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((new Date(date).getTime() - today) / 86_400_000);
}

export default async function CalendarPage() {
  const events = eventsRepo.listOpenWithDoc();

  return (
    <PageShell
      title="カレンダー"
      description="書類から抽出した期日(更新・引き渡し・解約予告・支払など)。期日が近づくと、ダッシュボードとこの画面で強調表示されます。"
    >
      {events.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon />}
          title="期日はありません"
          description="書類を整理して内容が確定すると、抽出された期日がここに表示されます。"
        />
      ) : (
        <div className="space-y-3">
          {events.map((e) => {
            const dleft = e.due_date ? daysUntil(e.due_date) : null;
            const inWindow =
              dleft !== null && dleft >= 0 && dleft <= e.notify_lead_days;
            const overdue = dleft !== null && dleft < 0;
            return (
              <div key={e.id} className="card flex flex-wrap items-center gap-4">
                <div className="min-w-32">
                  <div className="text-sm font-semibold">{e.due_date ?? "日付未定"}</div>
                  {dleft !== null && (
                    <div
                      className={`text-xs ${
                        overdue
                          ? "text-kura-danger"
                          : inWindow
                            ? "text-kura-warn"
                            : "text-gray-400"
                      }`}
                    >
                      {overdue ? `${-dleft}日超過` : `あと${dleft}日`}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{e.event_type}</div>
                  {e.action_needed && (
                    <div className="text-sm text-gray-600">{e.action_needed}</div>
                  )}
                  <div className="mt-1 text-xs text-gray-400">
                    {e.documents?.title ?? "書類"}
                    {" ・"}
                    {e.notify_lead_days}
                    日前から強調表示
                  </div>
                </div>
                <div className="flex gap-2">
                  {e.document_id && (
                    <Link
                      href={`/api/files/${e.document_id}`}
                      className="btn-ghost text-xs"
                      prefetch={false}
                    >
                      書類
                    </Link>
                  )}
                  <form action={updateEventStatus}>
                    <input type="hidden" name="event_id" value={e.id} />
                    <input type="hidden" name="status" value="done" />
                    <button className="btn-ghost text-xs">完了</button>
                  </form>
                  <form action={updateEventStatus}>
                    <input type="hidden" name="event_id" value={e.id} />
                    <input type="hidden" name="status" value="dismissed" />
                    <button className="btn-ghost text-xs text-gray-400">対象外</button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
