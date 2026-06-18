/** Row types mirroring the local SQLite schema (the subset the UI reads). */

export interface CollectionRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface DocumentRow {
  id: string;
  collection_id: string | null;
  content_hash: string;
  doc_type: string | null;
  title: string | null;
  extracted_fields: Record<string, string | number | null>;
  keywords: string[];
  embedding: number[] | null;
  confidence: number | null;
  model: string | null;
  prompt_version: string | null;
  status: "pending" | "needs_review" | "confirmed";
  storage_path: string | null;
  original_filename: string | null;
  mime_type: string | null;
  is_stub: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventRow {
  id: string;
  document_id: string | null;
  collection_id: string | null;
  event_type: string;
  due_date: string | null;
  notify_lead_days: number;
  action_needed: string | null;
  status: "open" | "done" | "dismissed";
  notified_at: string | null;
  generated_doc_id: string | null;
  created_at: string;
}

export interface TemplateRow {
  id: string;
  name: string;
  doc_type: string | null;
  body: string;
  version: number;
  created_at: string;
}
