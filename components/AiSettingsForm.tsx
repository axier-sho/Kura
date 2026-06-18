"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { updateAiSettings, clearApiKey } from "@/app/settings/actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "保存中…" : "保存"}
    </button>
  );
}

/**
 * A model picker that submits its value via a hidden input named `field`, so a
 * curated <select> and a free-text "custom" input can share one submitted value.
 */
function ModelField({
  field,
  label,
  models,
  initial,
}: {
  field: string;
  label: string;
  models: string[];
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [custom, setCustom] = useState(!models.includes(initial));

  return (
    <div>
      <label className="label">{label}</label>
      {/* Carries the resolved value regardless of which control is shown. */}
      <input type="hidden" name={field} value={value} />
      {custom ? (
        <input
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="モデル ID(例: gemini-2.5-flash)"
        />
      ) : (
        <select
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        >
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        className="mt-1 text-xs text-gray-500 hover:text-kura-accent"
        onClick={() => {
          setCustom((c) => !c);
          if (!custom) setValue("");
          else setValue(models[0] ?? "");
        }}
      >
        {custom ? "一覧から選ぶ" : "その他(自由入力)"}
      </button>
    </div>
  );
}

export function AiSettingsForm({
  models,
  hasKey,
  model,
  modelEscalation,
}: {
  models: string[];
  hasKey: boolean;
  model: string;
  modelEscalation: string;
}) {
  return (
    <div className="space-y-6">
      <form action={updateAiSettings} className="card space-y-5">
        <div>
          <label className="label">Gemini API キー(自分のキーを使用)</label>
          <input
            type="password"
            name="api_key"
            className="input"
            autoComplete="off"
            placeholder={hasKey ? "設定済み(変更する場合のみ入力)" : "AIza… で始まるキー"}
          />
          <p className="mt-1 text-xs text-gray-500">
            Kura は AI キーを提供していません。
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-kura-accent hover:underline"
            >
              Google AI Studio
            </a>
            で取得した自分のキーを登録してください。キーは暗号化して保存され、画面には表示されません。
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ModelField field="model" label="モデル(主)" models={models} initial={model} />
          <ModelField
            field="model_escalation"
            label="モデル(確信度が低いとき)"
            models={models}
            initial={modelEscalation}
          />
        </div>

        <SaveButton />
      </form>

      {hasKey ? (
        <form action={clearApiKey} className="card flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">API キーを削除</div>
            <p className="text-xs text-gray-500">
              削除すると AI は再び「未設定」のスタブに戻ります。
            </p>
          </div>
          <button type="submit" className="btn-ghost text-sm text-kura-danger">
            キーを削除
          </button>
        </form>
      ) : null}
    </div>
  );
}
