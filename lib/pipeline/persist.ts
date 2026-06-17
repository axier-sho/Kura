import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { sha256 } from "@/lib/hash";
import { PROMPT_VERSION } from "@/lib/pipeline/prompts";
import type { PipelineOutput } from "@/lib/pipeline";
import type { IngestInput } from "@/lib/pipeline/types";

export interface PersistResult {
  documentId: string;
  cached: boolean;
}

/** Format a JS number[] for a pgvector column (text input form: "[1,2,3]"). */
function toVectorLiteral(v: number[] | null): string | null {
  return v ? `[${v.join(",")}]` : null;
}

/**
 * Persist a pipeline result: upload original to Storage, upsert the document
 * row keyed by content hash (cache = index, spec §3), and insert due-date
 * events. Returns the existing row untouched on a cache hit.
 */
export async function persistDocument(
  supabase: SupabaseClient,
  orgId: string,
  input: IngestInput,
  output: PipelineOutput,
  collectionId: string | null,
): Promise<PersistResult> {
  const hash = sha256(input.bytes);

  // Cache check: same content + same prompt version → reuse (no re-scan).
  const { data: existing, error: lookupError } = await supabase
    .from("documents")
    .select("id")
    .eq("org_id", orgId)
    .eq("content_hash", hash)
    .eq("prompt_version", PROMPT_VERSION)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`キャッシュ確認に失敗しました: ${lookupError.message}`);
  }
  if (existing?.id) return { documentId: existing.id, cached: true };

  // Upload original file (path prefixed by org for the storage RLS policy).
  const storagePath = `${orgId}/${hash}-${input.filename}`;
  const { error: uploadError } = await supabase.storage
    .from(env.storageBucket)
    .upload(storagePath, Buffer.from(input.bytes), {
      contentType: input.mimeType,
      upsert: true,
    });
  if (uploadError) {
    throw new Error(
      `ファイルのアップロードに失敗しました: ${uploadError.message}`,
    );
  }

  const { analysis, embedding } = output;

  const { data: doc, error } = await supabase
    .from("documents")
    .insert({
      org_id: orgId,
      collection_id: collectionId,
      content_hash: hash,
      doc_type: analysis.doc_type,
      title: analysis.title,
      extracted_fields: analysis.fields,
      keywords: analysis.keywords,
      embedding: toVectorLiteral(embedding),
      confidence: analysis.confidence,
      model: analysis.model,
      prompt_version: analysis.prompt_version,
      status: "needs_review",
      storage_path: storagePath,
      original_filename: input.filename,
      mime_type: input.mimeType,
      is_stub: analysis.is_stub,
    })
    .select("id")
    .single();

  if (error) {
    // A concurrent ingest of the same content can race past the cache check
    // above and hit the unique(org_id, content_hash, prompt_version) constraint.
    // Treat that as a cache hit by returning the row the other request created.
    if (error.code === "23505") {
      const { data: raced } = await supabase
        .from("documents")
        .select("id")
        .eq("org_id", orgId)
        .eq("content_hash", hash)
        .eq("prompt_version", PROMPT_VERSION)
        .maybeSingle();
      if (raced?.id) return { documentId: raced.id, cached: true };
    }
    throw new Error(`書類の保存に失敗しました: ${error.message}`);
  }
  if (!doc) {
    throw new Error("書類の保存に失敗しました: unknown");
  }

  if (analysis.events.length > 0) {
    const { error: eventsError } = await supabase.from("events").insert(
      analysis.events.map((e) => ({
        org_id: orgId,
        document_id: doc.id,
        collection_id: collectionId,
        event_type: e.event_type,
        due_date: e.due_date,
        notify_lead_days: e.notify_lead_days,
        action_needed: e.action_needed,
        status: "open" as const,
      })),
    );
    if (eventsError) {
      throw new Error(`期日イベントの保存に失敗しました: ${eventsError.message}`);
    }
  }

  return { documentId: doc.id, cached: false };
}
