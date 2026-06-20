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
 * Validate the saved key against Gemini and report the result inline, so a
 * wrong/revoked key surfaces here instead of silently turning every ingest into
 * a "解析エラー" stub. Tests the *stored* key (paste → 保存 → 接続テスト).
 */
function TestConnectionButton() {
  const [state, setState] = useState<{
    status: "idle" | "testing" | "ok" | "error";
    message?: string;
  }>({ status: "idle" });

  async function test() {
    setState({ status: "testing" });
    try {
      const res = await fetch("/api/ai/test", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (data.ok) setState({ status: "ok" });
      else
        setState({
          status: "error",
          message: data.error ?? "接続に失敗しました。",
        });
    } catch (e) {
      setState({ status: "error", message: (e as Error).message });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={test}
        disabled={state.status === "testing"}
        className="btn-ghost text-sm"
      >
        {state.status === "testing" ? "テスト中…" : "接続テスト"}
      </button>
      {state.status === "ok" && (
        <span className="text-xs text-kura-accent">接続に成功しました。</span>
      )}
      {state.status === "error" && (
        <span className="text-xs text-kura-danger">{state.message}</span>
      )}
    </div>
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
  keyError,
  model,
  modelEscalation,
  occupation,
  customInstruction,
}: {
  models: string[];
  hasKey: boolean;
  keyError: boolean;
  model: string;
  modelEscalation: string;
  occupation: string;
  customInstruction: string;
}) {
  return (
    <div className="space-y-6">
      {keyError && (
        <div className="card border-amber-300 bg-amber-50 text-sm text-amber-900">
          保存済みの API キーを復号できませんでした(KURA_ENCRYPTION_KEY
          または暗号鍵ファイルが変わった可能性があります)。キーを再入力して保存してください。
        </div>
      )}
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

        <div className="space-y-4 border-t pt-5">
          <div>
            <label className="label">職業(任意)</label>
            <input
              name="occupation"
              className="input"
              defaultValue={occupation}
              maxLength={200}
              autoComplete="off"
              placeholder="例: 不動産仲介業 / 経理担当"
            />
          </div>
          <div>
            <label className="label">カスタム指示(任意)</label>
            <textarea
              name="custom_instruction"
              className="input min-h-[80px]"
              defaultValue={customInstruction}
              maxLength={2000}
              placeholder="例: 契約書は物件名でフォルダ分け。請求書は取引先名で。社外秘は『機密』へ。"
            />
            <p className="mt-1 text-xs text-gray-500">
              ここに書いた職業・指示は、毎回の整理で常に AI に渡されます。
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SaveButton />
          {hasKey && <TestConnectionButton />}
        </div>
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
