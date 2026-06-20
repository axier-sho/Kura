"use client";

/**
 * Segment error boundary for /review. A failed server action (e.g. the SQLite
 * UPDATE in reviewDocument throwing because the DB is locked by folder-watch
 * ingestion, read-only, or out of disk) is caught here and shown as a localized,
 * retryable message instead of crashing to Next's full-page GlobalError.
 */
export default function ReviewError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="card space-y-3 border-red-200 bg-red-50">
        <h2 className="text-sm font-semibold text-kura-danger">
          確認待ちの処理でエラーが発生しました
        </h2>
        <p className="text-sm text-gray-600">
          {error.message || "保存に失敗しました。もう一度お試しください。"}
        </p>
        <button onClick={reset} className="btn-primary text-sm">
          再試行
        </button>
      </div>
    </div>
  );
}
