import { NextResponse, type NextRequest } from "next/server";
import { isGeminiConfigured } from "@/lib/env";
import { embed } from "@/lib/gemini";
import * as documents from "@/lib/db/repositories/documents";

export const runtime = "nodejs";

/**
 * Combined search: structured (LIKE on title/doc_type) + semantic (in-JS cosine
 * over stored embeddings when Gemini is configured). Returns deduped documents,
 * semantic hits first by similarity.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { q?: string; collectionId?: string };
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

  // --- semantic ---
  let semanticUsed = false;
  if (q && isGeminiConfigured()) {
    const vec = await embed(q);
    if (vec) {
      semanticUsed = true;
      documents.searchByEmbedding(vec, collectionId, 20).forEach((m) => {
        ids.add(m.id);
        similarity.set(m.id, m.similarity);
      });
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
