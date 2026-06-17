"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

export function LoginForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const action = mode === "signin" ? signIn : signUp;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="card space-y-4">
      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={`flex-1 rounded-md py-2 ${
            mode === "signin"
              ? "bg-kura-accentSoft font-medium text-kura-accent"
              : "text-gray-500"
          }`}
        >
          ログイン
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`flex-1 rounded-md py-2 ${
            mode === "signup"
              ? "bg-kura-accentSoft font-medium text-kura-accent"
              : "text-gray-500"
          }`}
        >
          新規登録
        </button>
      </div>

      {mode === "signup" && (
        <div>
          <label className="label" htmlFor="org_name">
            組織名(任意)
          </label>
          <input id="org_name" name="org_name" className="input" placeholder="マイ組織" />
        </div>
      )}

      <div>
        <label className="label" htmlFor="email">
          メールアドレス
        </label>
        <input id="email" name="email" type="email" required className="input" />
      </div>

      <div>
        <label className="label" htmlFor="password">
          パスワード
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          className="input"
        />
      </div>

      {state.error && <p className="text-sm text-kura-danger">{state.error}</p>}
      {state.message && (
        <p className="text-sm text-kura-accent">{state.message}</p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "処理中…" : mode === "signin" ? "ログイン" : "登録"}
      </button>
    </form>
  );
}
