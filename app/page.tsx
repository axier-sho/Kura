import Link from "next/link";
import { isAiConfigured } from "@/lib/ai/config";
import { PageShell } from "@/components/PageShell";
import { FolderWatchSettings } from "@/components/desktop/FolderWatchSettings";
import * as documentsRepo from "@/lib/db/repositories/documents";
import * as collectionsRepo from "@/lib/db/repositories/collections";
import * as eventsRepo from "@/lib/db/repositories/events";

export const dynamic = "force-dynamic";

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="card block hover:border-kura-accent">
      <div className="text-3xl font-bold text-kura-accent">{value}</div>
      <div className="mt-1 text-sm text-gray-600">{label}</div>
    </Link>
  );
}

export default async function DashboardPage() {
  const needsReview = documentsRepo.countByStatus("needs_review");
  const confirmed = documentsRepo.countByStatus("confirmed");
  const collections = collectionsRepo.count();
  const upcoming = eventsRepo.listUpcoming(5);

  return (
    <PageShell
      title="ダッシュボード"
      description="書類整理の状況と直近の期日。"
    >
      <div className="space-y-8">
        {!isAiConfigured() && (
          <div className="card border-amber-300 bg-amber-50 text-sm text-amber-900">
            AI を使うには{" "}
            <Link href="/settings" className="font-medium underline">
              設定
            </Link>{" "}
            で自分の Gemini API キーを登録してください。未登録の間も取り込みは動作しますが、
            分類・抽出・意味検索は「未設定」のスタブになります。
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="確認待ち" value={needsReview} href="/review" />
          <Stat label="確定済み" value={confirmed} href="/search" />
          <Stat label="コレクション" value={collections} href="/collections" />
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">直近の期日</h2>
            <Link href="/calendar" className="text-sm text-kura-accent hover:underline">
              カレンダーへ →
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <div className="card text-sm text-gray-500">直近の期日はありません。</div>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((e) => (
                <li key={e.id} className="card flex items-center justify-between">
                  <div>
                    <div className="font-medium">{e.event_type}</div>
                    {e.action_needed && (
                      <div className="text-xs text-gray-500">{e.action_needed}</div>
                    )}
                  </div>
                  <div className="text-sm text-gray-600">{e.due_date}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <FolderWatchSettings />
      </div>
    </PageShell>
  );
}
