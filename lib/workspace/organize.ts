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
import { runPipeline } from "@/lib/pipeline";
import type { IngestInput } from "@/lib/pipeline/types";
import { getWorkingDir } from "@/lib/workspace/settings";
import { listWorkspace, moveFile, createCategoryFolder } from "@/lib/workspace/fs";
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
  workingDir: string;
  processed: number;
  moved: number;
  held: number;
  errors: number;
  results: OrganizeFileResult[];
}

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

export async function runOrganize(): Promise<OrganizeRunResult> {
  const workingDir = getWorkingDir();
  if (!workingDir) {
    throw new Error("ワーキングディレクトリが設定されていません。");
  }

  const listing = listWorkspace(workingDir);
  const results: OrganizeFileResult[] = [];

  // Mutable category list so a folder created mid-run is reusable by later files.
  const categories = [...listing.categories];
  const nameToCollectionId = syncCategoriesToCollections(categories);

  for (const srcPath of listing.inboxFiles) {
    const filename = path.basename(srcPath);
    try {
      const bytes = new Uint8Array(fs.readFileSync(srcPath));
      const input: IngestInput = {
        bytes,
        filename,
        mimeType: guessMimeType(filename),
      };
      const output = await runPipeline(input);
      const choice = await chooseTargetFolder(output.analysis, categories);

      const confident =
        choice.folderName !== null &&
        choice.confidence >= AUTO_MOVE_THRESHOLD;

      if (confident && choice.folderName) {
        let collectionId: string | null;
        if (choice.isNew) {
          createCategoryFolder(workingDir, choice.folderName);
          collectionId = ensureCollectionForFolder(choice.folderName);
          if (!categories.includes(choice.folderName)) {
            categories.push(choice.folderName);
            nameToCollectionId.set(choice.folderName, collectionId);
          }
        } else {
          collectionId = nameToCollectionId.get(choice.folderName) ?? null;
        }
        const destDir = path.join(workingDir, choice.folderName);
        const newPath = moveFile(workingDir, srcPath, destDir, filename);
        const { documentId } = persistOrganized({
          input,
          output,
          collectionId,
          storagePath: newPath,
          status: "confirmed",
        });
        results.push({
          filename,
          action: "moved",
          folder: choice.folderName,
          isNew: choice.isNew,
          documentId,
          confidence: choice.confidence,
        });
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
        results.push({
          filename,
          action: "held",
          folder: choice.folderName ?? undefined,
          documentId,
          confidence: choice.confidence,
        });
      }
    } catch (err) {
      results.push({
        filename,
        action: "error",
        error: (err as Error).message,
      });
    }
  }

  return {
    workingDir,
    processed: results.length,
    moved: results.filter((r) => r.action === "moved").length,
    held: results.filter((r) => r.action === "held").length,
    errors: results.filter((r) => r.action === "error").length,
    results,
  };
}
