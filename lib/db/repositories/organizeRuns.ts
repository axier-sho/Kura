/**
 * Organize-run history: one row per `runOrganize` pass. Backs both the on-screen
 * history list (the per-run instruction/feedback the user gave + the outcome)
 * and the "元に戻す" (undo) feature, whose move-log is stored as JSON in `moves`.
 */
import { getDb, newId, now } from "@/lib/db/sqlite";

/** One auto-moved file, with enough to reverse the move (undo). */
export interface MoveLogEntry {
  documentId: string;
  /** The inbox filename before the move (used to restore + as the basename). */
  filename: string;
  /** The file's actual landing path after the move (may differ via " (2)"). */
  toPath: string;
  /** The category folder it was moved into. */
  folder: string;
  /** Whether `folder` was newly created this run (empty-folder cleanup on undo). */
  isNew: boolean;
}

export interface OrganizeRunRow {
  id: string;
  created_at: string;
  working_dir: string;
  /** The per-run instruction used (incl. appended feedback); null if none. */
  instruction: string | null;
  /** The feedback delta that triggered this run; null for a first run. */
  feedback: string | null;
  processed: number;
  moved: number;
  held: number;
  errors: number;
  undone: boolean;
  moves: MoveLogEntry[];
}

type RawRun = Omit<OrganizeRunRow, "undone" | "moves"> & {
  undone: number;
  moves: string;
};

/** Tolerant parse of the moves JSON column: a corrupt value degrades to []. */
function parseMoves(raw: string): MoveLogEntry[] {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as MoveLogEntry[]) : [];
  } catch {
    return [];
  }
}

function mapRun(r: RawRun): OrganizeRunRow {
  return { ...r, undone: r.undone === 1, moves: parseMoves(r.moves) };
}

export interface InsertRunInput {
  workingDir: string;
  instruction: string | null;
  feedback: string | null;
  processed: number;
  moved: number;
  held: number;
  errors: number;
  moves: MoveLogEntry[];
}

export function insertRun(input: InsertRunInput): string {
  const id = newId();
  getDb()
    .prepare(
      `INSERT INTO organize_runs (
        id, created_at, working_dir, instruction, feedback,
        processed, moved, held, errors, moves, undone
      ) VALUES (
        @id, @created_at, @working_dir, @instruction, @feedback,
        @processed, @moved, @held, @errors, @moves, 0
      )`,
    )
    .run({
      id,
      created_at: now(),
      working_dir: input.workingDir,
      instruction: input.instruction,
      feedback: input.feedback,
      processed: input.processed,
      moved: input.moved,
      held: input.held,
      errors: input.errors,
      moves: JSON.stringify(input.moves ?? []),
    });
  return id;
}

export function listRecent(limit = 20): OrganizeRunRow[] {
  const rows = getDb()
    .prepare("SELECT * FROM organize_runs ORDER BY created_at DESC LIMIT ?")
    .all(limit) as RawRun[];
  return rows.map(mapRun);
}

export function getRun(id: string): OrganizeRunRow | undefined {
  const row = getDb()
    .prepare("SELECT * FROM organize_runs WHERE id = ?")
    .get(id) as RawRun | undefined;
  return row ? mapRun(row) : undefined;
}

export function markUndone(id: string): void {
  getDb().prepare("UPDATE organize_runs SET undone = 1 WHERE id = ?").run(id);
}

/**
 * The most recent run that can still be undone: not already undone, actually
 * moved files, and scoped to the given working directory (undoing a run from a
 * different working dir would touch the wrong tree).
 */
export function latestUndoable(workingDir: string): OrganizeRunRow | undefined {
  const row = getDb()
    .prepare(
      `SELECT * FROM organize_runs
        WHERE undone = 0 AND moved > 0 AND working_dir = ?
        ORDER BY created_at DESC LIMIT 1`,
    )
    .get(workingDir) as RawRun | undefined;
  return row ? mapRun(row) : undefined;
}
