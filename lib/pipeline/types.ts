/** Shared types for the ingestion / analysis pipeline. */

export type DocumentStatus = "pending" | "needs_review" | "confirmed";

/** A due-date event extracted from a document (spec: events[] array). */
export interface ExtractedEvent {
  /** e.g. 更新日 / 引き渡し日 / 解約予告期限 / 支払期日 — free-form, domain-agnostic. */
  event_type: string;
  /** ISO date (YYYY-MM-DD). May be null if only a lead-time was found. */
  due_date: string | null;
  /** Days before due_date to notify. */
  notify_lead_days: number;
  /** What the user must do by then (人が読む説明). */
  action_needed: string | null;
}

/** The single-call Gemini output: classification + extraction + keywords + events. */
export interface AnalysisResult {
  /** Document type label, e.g. 契約書 / 請求書 / 領収書 / 申込書 … (not hardcoded). */
  doc_type: string;
  /** A concise, human-friendly title for the file. */
  title: string;
  /** Structured key/value fields pulled from the document. */
  fields: Record<string, string | number | null>;
  /** Search keywords. */
  keywords: string[];
  /** Due-date events. */
  events: ExtractedEvent[];
  /** Model self-reported confidence in [0,1]. */
  confidence: number;
  /** Which model produced this (filled by the pipeline, not the model). */
  model: string;
  /** Prompt version used (filled by the pipeline). */
  prompt_version: string;
  /** True when this is an env-gated stub (no GEMINI_API_KEY). */
  is_stub: boolean;
}

/** Raw input to the pipeline. */
export interface IngestInput {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
}

/** Result of text extraction (text-first / vision-fallback decision). */
export interface ExtractedText {
  /** Extracted text layer, empty when there is none. */
  text: string;
  /** True when no usable text layer was found → use Gemini vision on the bytes. */
  needsVision: boolean;
}
