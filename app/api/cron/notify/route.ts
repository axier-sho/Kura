import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/notify/email";
import { env } from "@/lib/env";
import type { EventRow } from "@/lib/db/types";

export const runtime = "nodejs";

function daysBetween(a: string, b: string): number {
  const ms = new Date(a).getTime() - new Date(b).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Cron target (Vercel Cron). Finds open events that have entered their notify
 * window (due_date - notify_lead_days <= today <= due_date), emails each org a
 * summary, and stamps notified_at. Protected by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const isVercelCron = Boolean(req.headers.get("x-vercel-cron"));
  const authedBySecret = Boolean(env.cronSecret) && auth === `Bearer ${env.cronSecret}`;
  if (!isVercelCron && !authedBySecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Supabase service role is not configured." },
      { status: 503 },
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: events, error } = await admin
    .from("events")
    .select("*")
    .eq("status", "open")
    .is("notified_at", null)
    .not("due_date", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Keep events inside their notify window and not yet past due.
  const due = (events as EventRow[]).filter((e) => {
    if (!e.due_date) return false;
    const lead = daysBetween(e.due_date, today); // days until due
    return lead <= e.notify_lead_days && lead >= 0;
  });

  if (due.length === 0) {
    return NextResponse.json({ notified: 0, message: "対象なし" });
  }

  // Group by org and pick a recipient (the org's first profile email).
  const byOrg = new Map<string, EventRow[]>();
  for (const e of due) {
    const list = byOrg.get(e.org_id) ?? [];
    list.push(e);
    byOrg.set(e.org_id, list);
  }

  let notified = 0;
  const failedOrgs: string[] = [];
  for (const [orgId, orgEvents] of byOrg) {
    const { data: profile } = await admin
      .from("profiles")
      .select("email")
      .eq("org_id", orgId)
      .not("email", "is", null)
      .limit(1)
      .maybeSingle();

    const to = profile?.email;
    if (!to) {
      // No recipient: leave notified_at null so these events are retried once
      // an org email exists, rather than being permanently marked notified.
      console.log(`[kura] org ${orgId}: 宛先メールなし。${orgEvents.length}件未通知。`);
      continue;
    }

    const rows = orgEvents
      .map(
        (e) =>
          `<li><b>${e.event_type}</b> 期日 ${e.due_date}${
            e.action_needed ? `(${e.action_needed})` : ""
          }</li>`,
      )
      .join("");
    const html = `<p>期日が近づいている項目が ${orgEvents.length} 件あります。</p><ul>${rows}</ul>`;

    try {
      const { sent } = await sendEmail({ to, subject: "【Kura】期日のお知らせ", html });
      if (!sent) {
        // Email not configured: don't stamp, so nothing is silently suppressed.
        console.log(`[kura] org ${orgId}: メール未送信。${orgEvents.length}件未通知。`);
        continue;
      }
    } catch (e) {
      // Delivery failed: leave notified_at null so the next run retries.
      console.error(`[kura] org ${orgId}: メール送信に失敗しました。`, e);
      failedOrgs.push(orgId);
      continue;
    }

    // Only stamp notified_at after a confirmed successful send.
    const ids = orgEvents.map((e) => e.id);
    const { error: updateError } = await admin
      .from("events")
      .update({ notified_at: new Date().toISOString() })
      .in("id", ids);
    if (updateError) {
      // Stamp failed after a successful send (events may be re-sent next run);
      // surface it rather than reporting clean success.
      console.error(`[kura] org ${orgId}: notified_at の更新に失敗しました。`, updateError);
      failedOrgs.push(orgId);
      continue;
    }
    notified += orgEvents.length;
  }

  return NextResponse.json(
    failedOrgs.length > 0 ? { notified, failed: failedOrgs.length } : { notified },
  );
}
