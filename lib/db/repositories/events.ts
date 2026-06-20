/** Event (due-date) reads/writes against the local SQLite database. */
import { getDb, newId, now } from "@/lib/db/sqlite";
import type { EventRow } from "@/lib/db/types";

export type EventWithDoc = EventRow & {
  documents: { title: string | null } | null;
};

/** Upcoming dated, open events for the dashboard. Bounded to today-or-later
 *  (local) so the "直近の期日" list shows genuinely upcoming dates; overdue items
 *  surface separately via listDueReminders(). */
export function listUpcoming(limit = 5): EventRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM events WHERE status = 'open' AND due_date IS NOT NULL AND due_date >= date('now', 'localtime') ORDER BY due_date ASC LIMIT ?",
    )
    .all(limit) as EventRow[];
}

/** Open, dated events that are overdue or within their per-type lead window —
 *  the "due soon / overdue" set surfaced as reminders when the app is opened. */
export function listDueReminders(): EventWithDoc[] {
  const rows = getDb()
    .prepare(
      `SELECT e.*, d.title AS doc_title
         FROM events e
         LEFT JOIN documents d ON d.id = e.document_id
        WHERE e.status = 'open'
          AND e.due_date IS NOT NULL
          AND e.due_date <= date('now', 'localtime', '+' || e.notify_lead_days || ' days')
        ORDER BY e.due_date ASC`,
    )
    .all() as (EventRow & { doc_title: string | null })[];
  return rows.map(({ doc_title, ...e }) => ({
    ...e,
    documents: e.document_id ? { title: doc_title } : null,
  }));
}

/** All open events with their document title, for the calendar (nulls last). */
export function listOpenWithDoc(): EventWithDoc[] {
  const rows = getDb()
    .prepare(
      `SELECT e.*, d.title AS doc_title
         FROM events e
         LEFT JOIN documents d ON d.id = e.document_id
        WHERE e.status = 'open'
        ORDER BY e.due_date IS NULL, e.due_date ASC`,
    )
    .all() as (EventRow & { doc_title: string | null })[];
  return rows.map(({ doc_title, ...e }) => ({
    ...e,
    documents: e.document_id ? { title: doc_title } : null,
  }));
}

export interface NewEvent {
  documentId: string | null;
  collectionId: string | null;
  eventType: string;
  dueDate: string | null;
  notifyLeadDays: number;
  actionNeeded: string | null;
}

export function insertMany(events: NewEvent[]): void {
  if (events.length === 0) return;
  const stmt = getDb().prepare(
    `INSERT INTO events (
       id, document_id, collection_id, event_type, due_date,
       notify_lead_days, action_needed, status, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
  );
  const insertAll = getDb().transaction((rows: NewEvent[]) => {
    for (const e of rows) {
      stmt.run(
        newId(),
        e.documentId,
        e.collectionId,
        e.eventType,
        e.dueDate,
        e.notifyLeadDays,
        e.actionNeeded,
        now(),
      );
    }
  });
  insertAll(events);
}

export function updateStatus(
  id: string,
  status: EventRow["status"],
): void {
  getDb()
    .prepare("UPDATE events SET status = ? WHERE id = ?")
    .run(status, id);
}
