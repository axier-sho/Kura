import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { isGeminiConfigured } from "@/lib/env";
import { embed } from "@/lib/gemini";
import type { DocumentRow } from "@/lib/db/types";

export const runtime = "nodejs";

/**
 * Combined search: structured (ILIKE on title/doc_type) + semantic (pgvector
 * via match_documents when Gemini is configured). Returns deduped documents,
 * semantic hits first by similarity.
 */
export async function POST(req: NextRequest) {
  const { supabase, orgId } = await getSessionContext();
  if (!supabase || !orgId) {
    return NextResponse.json({ error: "未認証" }, { status: 401 });
  }

  const body = (await req.json()) as { q?: string; collectionId?: string };
  const q = (body.q ?? "").trim();
  const collectionId = body.collectionId || null;

  const similarity = new Map<string, number>();
  const ids = new Set<string>();

  // --- structured ---
  let sq = supabase.from("documents").select("id").eq("org_id", orgId);
  if (collectionId) sq = sq.eq("collection_id", collectionId);
  if (q) {
    // Sanitize for the PostgREST `or` filter grammar.
    const safe = q.replace(/[,()%*]/g, " ").trim();
    if (safe) sq = sq.or(`title.ilike.%${safe}%,doc_type.ilike.%${safe}%`);
  }
  const { data: structured } = await sq.limit(50);
  structured?.forEach((r) => ids.add(r.id as string));

  // --- semantic ---
  let semanticUsed = false;
  if (q && isGeminiConfigured()) {
    const vec = await embed(q);
    if (vec) {
      semanticUsed = true;
      const { data: matches } = await supabase.rpc("match_documents", {
        query_embedding: `[${vec.join(",")}]`,
        match_count: 20,
        filter_collection: collectionId,
      });
      (matches as { id: string; similarity: number }[] | null)?.forEach((m) => {
        ids.add(m.id);
        similarity.set(m.id, m.similarity);
      });
    }
  }

  if (ids.size === 0) {
    return NextResponse.json({ documents: [], semanticUsed });
  }

  const { data: docs } = await supabase
    .from("documents")
    .select("*")
    .in("id", Array.from(ids));

  const documents = ((docs as DocumentRow[]) ?? []).sort((a, b) => {
    const sa = similarity.get(a.id) ?? -1;
    const sb = similarity.get(b.id) ?? -1;
    if (sa !== sb) return sb - sa;
    return b.created_at.localeCompare(a.created_at);
  });

  return NextResponse.json({ documents, semanticUsed });
}
