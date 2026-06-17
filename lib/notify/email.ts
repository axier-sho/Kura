import { Resend } from "resend";
import { env, isEmailConfigured } from "@/lib/env";

/**
 * Send an email via Resend. When RESEND_API_KEY is unset, the message is
 * logged instead of sent (env-gating) so the notify flow is still exercisable.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean }> {
  if (!isEmailConfigured()) {
    console.log(
      `[kura] (email未設定のため送信せずログ) to=${opts.to} subject=${opts.subject}`,
    );
    return { sent: false };
  }

  const resend = new Resend(env.resendApiKey);
  // Resend resolves with { error } on API-level failures (unverified domain,
  // invalid recipient, 4xx/5xx) rather than throwing, so check it explicitly.
  const { error } = await resend.emails.send({
    from: env.notifyFromEmail,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  if (error) {
    throw new Error(`メール送信に失敗しました: ${error.message}`);
  }
  return { sent: true };
}
