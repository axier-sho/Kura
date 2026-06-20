/**
 * Organize orchestrator: for each file in the working directory's inbox, run
 * the analysis pipeline, ask the AI for a target folder, and either move the
 * file into that folder (high confidence) or hold it in the inbox for review
 * (low confidence / no match / AI unconfigured).
 *
 * Runs entirely in the local Next.js server using Node fs. No Tauri commands
 * are involved; the desktop shell only supplies the working-dir path.
 */
import fs from "node:fs";
import path from "node:path";
import { getAiConfig, getUserProfile } from "@/lib/ai/config";
import { runPipeline } from "@/lib/pipeline";
import { sha256 } from "@/lib/hash";
import { PROMPT_VERSION } from "@/lib/pipeline/prompts";
import * as documents from "@/lib/db/repositories/documents";
import * as organizeRuns from "@/lib/db/repositories/organizeRuns";
import type { MoveLogEntry } from "@/lib/db/repositories/organizeRuns";
import type { IngestInput } from "@/lib/pipeline/types";
import { getWorkingDir } from "@/lib/workspace/settings";
import {
  listWorkspace,
  moveFile,
  createCategoryFolder,
  sanitizeFolderName,
} from "@/lib/workspace/fs";
import {
  syncCategoriesToCollections,
  ensureCollectionForFolder,
} from "@/lib/workspace/sync";
import { persistOrganized } from "@/lib/workspace/persist";
import { chooseTargetFolder, AUTO_MOVE_THRESHOLD } from "@/lib/workspace/route";

export interface OrganizeFileResult {
  filename: string;
  action: "moved" | "held" | "error";
  folder?: string;
  isNew?: boolean;
  documentId?: string;
  confidence?: number;
  error?: string;
}

export interface OrganizeRunResult {
  /** The recorded run id (for undo / history); null when nothing was recorded. */
  runId: string | null;
  workingDir: string;
  processed: number;
  moved: number;
  held: number;
  errors: number;
  results: OrganizeFileResult[];
}

/** Per-run options: free-text instruction (incl. appended feedback) + the
 *  feedback delta that triggered this run (recorded to history). */
export interface OrganizeOptions {
  instruction?: string;
  feedback?: string;
}

/**
 * Progress events streamed to the caller as the run proceeds. The desktop UI
 * renders these in a console tab so the user can see live, per-file activity
 * instead of an opaque "整理中…" spinner. `error` is emitted by the route when
 * the whole run throws (e.g. the working dir vanished mid-run).
 */
export type OrganizeEvent =
  | { type: "start"; total: number; workingDir: string }
  | { type: "file-start"; index: number; total: number; filename: string }
  | { type: "file-skip"; index: number; total: number; filename: string }
  | {
      type: "file-done";
      index: number;
      total: number;
      result: OrganizeFileResult;
    }
  | { type: "done"; summary: OrganizeRunResult }
  | { type: "error"; message: string };

/** Best-effort MIME type from the file extension (the pipeline re-derives it). */
function guessMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return map[ext] ?? "application/octet-stream";
}

export async function runOrganize(
  onEvent?: (event: OrganizeEvent) => void,
  opts: OrganizeOptions = {},
): Promise<OrganizeRunResult> {
  // No-op when no listener is attached (e.g. a non-streaming caller).
  const emit = (event: OrganizeEvent) => onEvent?.(event);

  const workingDir = getWorkingDir();
  if (!workingDir) {
    throw new Error("ワーキングディレクトリが設定されていません。");
  }

  const listing = listWorkspace(workingDir);
  const total = listing.inboxFiles.length;
  const results: OrganizeFileResult[] = [];
  // Undo log: one entry per auto-moved file, enough to reverse the move later.
  const moves: MoveLogEntry[] = [];
  emit({ type: "start", total, workingDir });

  // BYOK: resolve the local API key + model choices once for the whole run.
  const ai = getAiConfig();

  // Compose the routing guidance once: standing profile (occupation + custom
  // instruction from /settings) followed by this run's free-text instruction
  // (which already includes any appended feedback). Injected into the routing
  // prompt only — never the analysis prompt, to keep the PROMPT_VERSION cache.
  const perRunInstruction = (opts.instruction ?? "").trim();
  const profile = getUserProfile();
  const guidance = [
    profile.occupation.trim() && `ユーザーの職業: ${profile.occupation.trim()}`,
    profile.customInstruction.trim(),
    perRunInstruction,
  ]
    .filter(Boolean)
    .join("\n");

  // Mutable category list so a folder created mid-run is reusable by later files.
  const categories = [...listing.categories];
  const nameToCollectionId = syncCategoriesToCollections(categories);

  let index = 0;
  for (const srcPath of listing.inboxFiles) {
    index += 1;
    const filename = path.basename(srcPath);
    emit({ type: "file-start", index, total, filename });
    try {
      const bytes = new Uint8Array(fs.readFileSync(srcPath));

      // Skip files the user already confirmed in /review: a confirmed file can
      // still physically sit in _inbox, so without this guard every organize run
      // would re-bill Gemini AND overwrite the confirmed status/location. A held
      // (needs_review) cached doc is still re-processed, so configuring the key
      // and re-running can upgrade an earlier stub.
      const cached = documents.findCached(sha256(bytes), PROMPT_VERSION);
      if (cached && documents.getById(cached.id)?.status === "confirmed") {
        emit({ type: "file-skip", index, total, filename });
        continue;
      }

      const input: IngestInput = {
        bytes,
        filename,
        mimeType: guessMimeType(filename),
      };
      const output = await runPipeline(input, ai);
      const choice = await chooseTargetFolder(
        output.analysis,
        categories,
        ai,
        guidance,
      );

      const confident =
        choice.folderName !== null &&
        choice.confidence >= AUTO_MOVE_THRESHOLD;

      if (confident && choice.folderName) {
        // Resolve the destination once so the on-disk folder, the collection
        // row, and the recorded name always agree. An existing category is used
        // verbatim (it is a real directory). A new folder — or one Gemini
        // claimed exists but doesn't (is_new=false with an unknown name) — is
        // sanitized and materialized, since its name is untrusted model output.
        // Using the raw name for the move while creating a sanitized folder
        // would land the file in a different (possibly nested) directory than
        // the one recorded in the collection.
        let collectionId = nameToCollectionId.get(choice.folderName) ?? null;
        let destName = choice.folderName;
        if (collectionId === null) {
          destName = sanitizeFolderName(choice.folderName);
          collectionId = nameToCollectionId.get(destName) ?? null;
          if (collectionId === null) {
            createCategoryFolder(workingDir, destName);
            collectionId = ensureCollectionForFolder(destName);
          }
          if (!categories.includes(destName)) {
            categories.push(destName);
            nameToCollectionId.set(destName, collectionId);
          }
        }
        const destDir = path.join(workingDir, destName);
        const newPath = moveFile(workingDir, srcPath, destDir, filename);
        let documentId: string;
        try {
          ({ documentId } = persistOrganized({
            input,
            output,
            collectionId,
            storagePath: newPath,
            status: "confirmed",
          }));
        } catch (persistErr) {
          // The file already left the inbox. If the DB write fails, move it back
          // so it stays in the inbox (tracked by the next run) instead of being
          // orphaned in a category folder with no document row pointing at it.
          try {
            fs.renameSync(newPath, srcPath);
          } catch {
            // Best-effort rollback only (e.g. cross-device): leave the moved
            // file in place and let the original error surface.
          }
          throw persistErr;
        }
        const movedResult: OrganizeFileResult = {
          filename,
          action: "moved",
          folder: destName,
          isNew: choice.isNew,
          documentId,
          confidence: choice.confidence,
        };
        results.push(movedResult);
        // Record enough to reverse this move (undo). `newPath` is the actual
        // landing path (uniqueDestPath may have appended " (2)"), not destDir.
        moves.push({
          documentId,
          filename,
          toPath: newPath,
          folder: destName,
          isNew: choice.isNew,
        });
        emit({ type: "file-done", index, total, result: movedResult });
      } else {
        // Hold in the inbox; surface in /review. If the AI proposed an existing
        // folder, pre-fill the suggestion via collection_id.
        const proposedCollectionId =
          choice.folderName && !choice.isNew
            ? nameToCollectionId.get(choice.folderName) ?? null
            : null;
        const { documentId } = persistOrganized({
          input,
          output,
          collectionId: proposedCollectionId,
          storagePath: srcPath,
          status: "needs_review",
        });
        const heldResult: OrganizeFileResult = {
          filename,
          action: "held",
          folder: choice.folderName ?? undefined,
          documentId,
          confidence: choice.confidence,
        };
        results.push(heldResult);
        emit({ type: "file-done", index, total, result: heldResult });
      }
    } catch (err) {
      const errorResult: OrganizeFileResult = {
        filename,
        action: "error",
        error: (err as Error).message,
      };
      results.push(errorResult);
      emit({ type: "file-done", index, total, result: errorResult });
    }
  }

  const moved = results.filter((r) => r.action === "moved").length;
  const held = results.filter((r) => r.action === "held").length;
  const errors = results.filter((r) => r.action === "error").length;

  // Record every run (even all-held) so the user's instruction history is kept;
  // the moves log makes a run undoable. Best-effort: a history write failure
  // must not fail the (already-completed) organize pass.
  let runId: string | null = null;
  try {
    runId = organizeRuns.insertRun({
      workingDir,
      instruction: perRunInstruction || null,
      feedback: (opts.feedback ?? "").trim() || null,
      processed: results.length,
      moved,
      held,
      errors,
      moves,
    });
  } catch (recErr) {
    console.error("[kura] failed to record organize run:", recErr);
  }

  const summary: OrganizeRunResult = {
    runId,
    workingDir,
    processed: results.length,
    moved,
    held,
    errors,
    results,
  };
  emit({ type: "done", summary });
  return summary;
}
