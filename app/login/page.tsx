import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { getSessionContext } from "@/lib/auth";
import { SetupNotice } from "@/components/SetupNotice";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (isSupabaseConfigured()) {
    const { user } = await getSessionContext();
    if (user) redirect("/");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <Link href="/" className="mb-6 text-center text-2xl font-bold text-kura-accent">
        蔵 Kura
      </Link>
      <p className="mb-6 text-center text-sm text-gray-600">
        書類整理AI 取り込み・分類・抽出・整理・検索・期日管理
      </p>

      {isSupabaseConfigured() ? (
        <LoginForm />
      ) : (
        <SetupNotice what="ログインには Supabase の設定が必要です。設定後にこのページからログインできます。" />
      )}
    </div>
  );
}
