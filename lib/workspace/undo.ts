/**
 * Undo an organize run: reverse each auto-move recorded in the run's move-log —
 * move the file back into the inbox and reset its document row to needs_review
 * (collection cleared) so the next organize pass re-routes it (e.g. after the
 * user adds a corrective instruction). Files the user has since confirmed in
 * /review, or that were moved/deleted by hand, are left untouched.
 *
 * Runs in the local Next.js server via Node fs (same as organize.ts).
 */
import fs from "node:fs";
import path from "node:path";
import * as documents from "@/lib/db/repositories/documents";
import * as organizeRuns from "@/lib/db/repositories/organizeRuns";
import { getWorkingDir, INBOX_NAME } from "@/lib/workspace/settings";
import { moveFile } from "@/lib/workspace/fs";

export interface UndoResult {
  runId: string;
  restored: number;
  skipped: number;
  errors: string[];
}

export function undoOrganizeRun(runId: string): UndoResult {
  const run = organizeRuns.getRun(runId);
  if (!run) throw new Error("対象の整理が見つかりません。");
  if (run.undone) throw new Error("この整理はすでに元に戻されています。");

  const workingDir = getWorkingDir();
  if (!workingDir) {
    throw new Error("ワーキングディレクトリが設定されていません。");
  }
  // The move-log paths are only valid against the working dir they were made in.
  if (run.working_dir !== workingDir) {
    throw new Error(
      "ワーキングディレクトリが変更されているため元に戻せません。",
    );
  }

  const inboxPath = path.join(workingDir, INBOX_NAME);
  fs.mkdirSync(inboxPath, { recursive: true });

  let restored = 0;
  let skipped = 0;
  const errors: string[] = [];
  // Folders we created this run; remove them if they end up empty after undo.
  const createdFolders = new Set<string>();

  for (const m of run.moves) {
    try {
      // Never revert a document the user finalized in /review.
      if (documents.getById(m.documentId)?.status === "confirmed") {
        skipped += 1;
        continue;
      }
      // The file may have been moved or deleted by hand since the run.
      if (!fs.existsSync(m.toPath)) {
        skipped += 1;
        continue;
      }
      const restoredPath = moveFile(workingDir, m.toPath, inboxPath, m.filename);
      try {
        documents.updateLocation(
          m.documentId,
          restoredPath,
          null,
          "needs_review",
        );
      } catch (updateErr) {
        // The file was physically moved but the DB write failed (e.g. a locked
        // DB). Roll the file back to its category location so the entry stays in
        // a consistent (file + row both at toPath) state and a retry re-attempts
        // the whole step — otherwise the retry would see the file already gone
        // from toPath, skip it, and leave the row pointing at the empty old path.
        try {
          moveFile(workingDir, restoredPath, path.dirname(m.toPath), m.filename);
        } catch (rollbackErr) {
          console.error("[kura] failed to roll back undo move:", rollbackErr);
        }
        throw updateErr;
      }
      if (m.isNew) createdFolders.add(m.folder);
      restored += 1;
    } catch (e) {
      errors.push(`${m.filename}: ${(e as Error).message}`);
    }
  }

  // Best-effort cleanup: rmdir only succeeds on an empty directory, so a folder
  // that still holds other files (ENOTEMPTY) is simply left in place.
  for (const folder of createdFolders) {
    try {
      fs.rmdirSync(path.join(workingDir, folder));
    } catch {
      // Not empty / already gone — leave it.
    }
  }

  // Only mark the run undone when fully reversed; on a partial failure leave it
  // undoable so the user can retry (already-restored files skip via missing path).
  if (errors.length === 0) organizeRuns.markUndone(runId);

  return { runId, restored, skipped, errors };
}
