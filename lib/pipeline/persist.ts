import { sha256 } from "@/lib/hash";
import { transaction } from "@/lib/db/sqlite";
import { PROMPT_VERSION } from "@/lib/pipeline/prompts";
import * as documents from "@/lib/db/repositories/documents";
import * as events from "@/lib/db/repositories/events";
import { saveFile } from "@/lib/storage/local";
import type { PipelineOutput } from "@/lib/pipeline";
import type { IngestInput } from "@/lib/pipeline/types";

export interface PersistResult {
  documentId: string;
  cached: boolean;
}

/**
 * Persist a pipeline result: save the original to local storage, insert the
 * document row keyed by content hash (cache = index, spec §3), and insert
 * due-date events. Returns the existing row untouched on a cache hit.
 */
export async function persistDocument(
  input: IngestInput,
  output: PipelineOutput,
  collectionId: string | null,
): Promise<PersistResult> {
  const hash = sha256(input.bytes);

  // Cache check: same content + same prompt version → reuse (no re-scan).
  const existing = documents.findCached(hash, PROMPT_VERSION);
  if (existing) return { documentId: existing.id, cached: true };

  // Save the original file locally; the returned path is the storage_path.
  const storagePath = saveFile(hash, input.filename, input.bytes);

  const { analysis, embedding } = output;

  // Insert the document and its due-date events atomically: if the events
  // insert fails, the document row must roll back too. Otherwise the document
  // commits, the caller reports the file as failed, and the user's retry hits
  // the content-hash cache (findCached) and skips the events block forever —
  // silently and permanently dropping the reminders this app exists to surface.
  let documentId: string;
  try {
    documentId = transaction(() => {
      const id = documents.insertDocument({
        collectionId,
        contentHash: hash,
        docType: analysis.doc_type,
        title: analysis.title,
        extractedFields: analysis.fields,
        keywords: analysis.keywords,
        embedding,
        confidence: analysis.confidence,
        model: analysis.model,
        promptVersion: analysis.prompt_version,
        storagePath,
        originalFilename: input.filename,
        mimeType: input.mimeType,
        isStub: analysis.is_stub,
      });

      if (analysis.events.length > 0) {
        events.insertMany(
          analysis.events.map((e) => ({
            documentId: id,
            collectionId,
            eventType: e.event_type,
            dueDate: e.due_date,
            notifyLeadDays: e.notify_lead_days,
            actionNeeded: e.action_needed,
          })),
        );
      }
      return id;
    });
  } catch (err) {
    // Concurrency race: a sibling ingest (same batch under bounded concurrency,
    // or a second overlapping request) inserted the same content_hash +
    // prompt_version between the findCached miss above and this insert, tripping
    // the UNIQUE constraint. The transaction rolled back fully, so re-resolve the
    // winning row and treat this as a cache hit instead of failing the file.
    const code = (err as { code?: string }).code ?? "";
    if (code.startsWith("SQLITE_CONSTRAINT")) {
      const raced = documents.findCached(hash, PROMPT_VERSION);
      if (raced) return { documentId: raced.id, cached: true };
    }
    throw err;
  }

  return { documentId, cached: false };
}
