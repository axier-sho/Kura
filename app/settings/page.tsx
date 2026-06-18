import { getSessionContext } from "@/lib/auth";
import { env, isSupabaseConfigured } from "@/lib/env";
import { GEMINI_MODELS } from "@/lib/ai/config";
import { PageShell } from "@/components/PageShell";
import { SetupNotice } from "@/components/SetupNotice";
import { AiSettingsForm } from "@/components/AiSettingsForm";

export const dynamic = "force-dynamic";

interface UserAiSettingsRow {
  gemini_api_key: string | null;
  gemini_model: string | null;
  gemini_model_escalation: string | null;
}

export default async function SettingsPage() {
  const { supabase, user } = await getSessionContext();

  if (!isSupabaseConfigured() || !supabase || !user) {
    return (
      <PageShell title="設定" description="使用する AI モデルと自分の Gemini API キー。">
        <SetupNotice what="設定には Supabase の設定とログインが必要です。" />
      </PageShell>
    );
  }

  // Read the user's own row (RLS-scoped). The key itself is never sent to the
  // client only whether one is set.
  const { data } = await supabase
    .from("user_ai_settings")
    .select("gemini_api_key, gemini_model, gemini_model_escalation")
    .eq("user_id", user.id)
    .maybeSingle();
  const row = (data as UserAiSettingsRow | null) ?? null;

  return (
    <PageShell
      email={user.email}
      title="設定"
      description="使用する AI モデルと、自分の Gemini API キーを設定します。"
    >
      <AiSettingsForm
        models={[...GEMINI_MODELS]}
        hasKey={Boolean(row?.gemini_api_key)}
        model={row?.gemini_model ?? env.geminiModel}
        modelEscalation={row?.gemini_model_escalation ?? env.geminiModelEscalation}
      />
    </PageShell>
  );
}
