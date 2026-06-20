import { PageShell } from "@/components/PageShell";
import { OrganizePanel } from "@/components/workspace/OrganizePanel";
import { getWorkingDir } from "@/lib/workspace/settings";
import { listWorkspace } from "@/lib/workspace/fs";
import * as organizeRuns from "@/lib/db/repositories/organizeRuns";

export const dynamic = "force-dynamic";

export default async function OrganizePage() {
  const workingDir = getWorkingDir();
  let inboxCount = 0;
  let categories: string[] = [];
  if (workingDir) {
    try {
      const listing = listWorkspace(workingDir);
      inboxCount = listing.inboxFiles.length;
      categories = listing.categories;
    } catch {
      // The working dir may have been deleted/moved; the panel lets the user
      // re-select it.
    }
  }

  // Drop the move-log before sending history to the client component (it only
  // needs the summary + instruction text; the move-log holds on-disk paths).
  const history = organizeRuns.listRecent(20).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    instruction: r.instruction,
    feedback: r.feedback,
    processed: r.processed,
    moved: r.moved,
    held: r.held,
    errors: r.errors,
    undone: r.undone,
  }));
  const undoableRunId = workingDir
    ? organizeRuns.latestUndoable(workingDir)?.id ?? null
    : null;

  return (
    <PageShell
      title="整理"
      description="ワーキングディレクトリの受信箱に入れたファイルを、AIが既存フォルダをスキャンして自動で振り分けます。確信度が低いものは確認待ちに保留されます。"
    >
      <div className="max-w-2xl">
        <OrganizePanel
          initialWorkingDir={workingDir}
          initialInboxCount={inboxCount}
          initialCategories={categories}
          initialHistory={history}
          initialUndoableRunId={undoableRunId}
        />
      </div>
    </PageShell>
  );
}
