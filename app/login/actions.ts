"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface AuthState {
  error?: string;
  message?: string;
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase が未設定です。" };

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect("/");
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase が未設定です。" };

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const orgName = String(formData.get("org_name") ?? "").trim();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: orgName ? { org_name: orgName } : undefined },
  });
  if (error) return { error: error.message };

  return {
    message:
      "登録しました。確認メールが必要な設定の場合はメールを確認してからログインしてください。",
  };
}
