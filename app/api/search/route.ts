import { NextResponse, type NextRequest } from "next/server";
import { getAiConfig } from "@/lib/ai/config";
import { embed } from "@/lib/gemini";
import * as documents from "@/lib/db/repositories/documents";

export const runtime = "nodejs";

/**
 * Combined search: structured (LIKE on title/doc_type) + semantic (in-JS cosine
 * over stored embeddings when Gemini is configured). Returns deduped documents,
 * semantic hits first by similarity.
 */
export async function POST(req: NextRequest) {
  let body: { q?: string; collectionId?: string };
  try {
    body = (await req.json()) as { q?: string; collectionId?: string };
  } catch {
    // Empty / malformed body: treat as an empty query rather than a 500.
    return NextResponse.json({ documents: [], semanticUsed: false });
  }
  const q = (body.q ?? "").trim();
  const collectionId = body.collectionId || null;

  const similarity = new Map<string, number>();
  const ids = new Set<string>();

  // --- structured ---
  // Strip LIKE wildcards so user input is treated literally.
  const safe = q.replace(/[%_]/g, " ").trim();
  documents.searchStructured(safe, collectionId, 50).forEach((id) =>
    ids.add(id),
  );

  // --- semantic (uses the locally configured Gemini key) ---
  let semanticUsed = false;
  const ai = getAiConfig();
  if (q && ai.configured) {
    // Semantic enrichment is best-effort: a Gemini error (expired/over-quota
    // key, network failure) must not fail the whole search — fall back to the
    // structured LIKE matches already gathered above.
    try {
      const vec = await embed({ apiKey: ai.apiKey, text: q });
      if (vec) {
        semanticUsed = true;
        documents.searchByEmbedding(vec, collectionId, 20).forEach((m) => {
          ids.add(m.id);
          similarity.set(m.id, m.similarity);
        });
      }
    } catch (err) {
      console.error("[kura] semantic search skipped (Gemini error):", err);
    }
  }

  if (ids.size === 0) {
    return NextResponse.json({ documents: [], semanticUsed });
  }

  const docs = documents.getByIds(Array.from(ids)).sort((a, b) => {
    const sa = similarity.get(a.id) ?? -1;
    const sb = similarity.get(b.id) ?? -1;
    if (sa !== sb) return sb - sa;
    return b.created_at.localeCompare(a.created_at);
  });

  return NextResponse.json({ documents: docs, semanticUsed });
}
