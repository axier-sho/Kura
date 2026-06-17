export function SetupNotice({ what }: { what?: string }) {
  return (
    <div className="card border-amber-300 bg-amber-50">
      <h2 className="mb-2 text-base font-semibold text-amber-900">
        セットアップが必要です
      </h2>
      <p className="text-sm text-amber-900">
        {what ?? "この機能を使うには Supabase と Gemini の設定が必要です。"}
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-900">
        <li>
          <code className="rounded bg-amber-100 px-1">.env.example</code> を{" "}
          <code className="rounded bg-amber-100 px-1">.env.local</code>{" "}
          にコピーして値を設定
        </li>
        <li>
          Supabase で <code className="rounded bg-amber-100 px-1">supabase/migrations/0001_init.sql</code> を実行
        </li>
        <li>
          <code className="rounded bg-amber-100 px-1">GEMINI_API_KEY</code> を設定すると分類・抽出が有効化されます
        </li>
      </ul>
      <p className="mt-3 text-xs text-amber-800">
        設定なしでも画面は動作します(AIは「未設定」のスタブ結果を返します)。
      </p>
    </div>
  );
}
