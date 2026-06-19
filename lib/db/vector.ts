/**
 * In-JS cosine similarity for semantic search. At a single-user local scale the
 * document count is small, so a brute-force scan over stored embeddings is more
 * than fast enough — no pgvector / ANN index needed.
 */

/** Cosine similarity in [-1, 1]; 0 when either vector is empty/degenerate. */
export function cosine(a: number[], b: number[]): number {
  // Fail loud on a dimension mismatch rather than silently truncating to the
  // shorter vector (which would corrupt ranking after an embedding-model/dim
  // change). Callers in the search path pre-filter by dimension; same-call
  // pairs (shortlist) are always equal-dimension.
  if (a.length !== b.length) {
    throw new Error(`cosine: dimension mismatch (${a.length} vs ${b.length})`);
  }
  const len = a.length;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
