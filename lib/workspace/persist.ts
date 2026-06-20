/**
 * Persist a document that lives inside the working directory (organize mode).
 *
 * Unlike lib/pipeline/persist.ts, this does NOT copy the file into the app-data
 * `filesDir`: the file already lives at `storagePath` inside the working dir
 * (either moved into a category subfolder, or still in the inbox when held for
 * review). It also lets the caller choose the row `status` (confirmed when
 * auto-moved, needs_review when held). Lower-level pieces are reused from the
 * repositories and the cache key (content hash + prompt version).
 */
import { sha256 } from "@/lib/hash";
import { transaction } from "@/lib/db/sqlite";
import { PROMPT_VERSION } from "@/lib/pipeline/prompts";
import * as documents from "@/lib/db/repositories/documents";
import * as events from "@/lib/db/repositories/events";
import type { DocumentRow } from "@/lib/db/types";
import type { PipelineOutput } from "@/lib/pipeline";
import type { IngestInput } from "@/lib/pipeline/types";

export interface OrganizePersistInput {
  input: IngestInput;
  output: PipelineOutput;
  collectionId: string | null;
  /** The file's current location inside the working directory. */
  storagePath: string;
  status: DocumentRow["status"];
}

export interface OrganizePersistResult {
  documentId: string;
  cached: boolean;
}

export function persistOrganized(
  args: OrganizePersistInput,
): OrganizePersistResult {
  const { input, output, collectionId, storagePath, status } = args;
  const hash = sha256(input.bytes);

  // Cache = index: same content + prompt version reuses the row. Refresh its
  // location/collection/status to reflect where the file just landed.
  const existing = documents.findCached(hash, PROMPT_VERSION);
  if (existing) {
    // Never re-home or downgrade a user-confirmed document: an organize re-run
    // must not overwrite the location/collection/status the user finalized.
    if (documents.getById(existing.id)?.status !== "confirmed") {
      documents.updateLocation(existing.id, storagePath, collectionId, status);
    }
    return { documentId: existing.id, cached: true };
  }

  const { analysis, embedding } = output;

  // Insert document + status promotion + events atomically: a partial failure
  // here would commit the document but lose its events, and the retry would hit
  // the content-hash cache and never re-insert them (see lib/pipeline/persist.ts).
  const documentId = transaction(() => {
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

    // insertDocument always writes status='needs_review'; promote to the desired
    // status (e.g. confirmed for auto-moved files) without changing fields.
    if (status !== "needs_review") {
      documents.updateLocation(id, storagePath, collectionId, status);
    }

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

  return { documentId, cached: false };
}
