import { GEMINI_MODELS, getAiSettingsView } from "@/lib/ai/config";
import { PageShell } from "@/components/PageShell";
import { AiSettingsForm } from "@/components/AiSettingsForm";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const view = getAiSettingsView();

  return (
    <PageShell
      title="設定"
      description="使用する AI モデルと、自分の Gemini API キーを設定します。"
    >
      <AiSettingsForm
        models={[...GEMINI_MODELS]}
        hasKey={view.hasKey}
        model={view.model}
        modelEscalation={view.modelEscalation}
      />
    </PageShell>
  );
}
