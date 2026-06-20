/**
 * Keep the DB `collections` table in sync with the working directory's real
 * subfolders. Each category subfolder maps to a collection of the same name so
 * the rest of the app (collections pages, search, review) keeps working.
 */
import * as collectionsRepo from "@/lib/db/repositories/collections";

/**
 * Ensure a collection row exists for every category folder. Returns a map from
 * folder name to collection id for all given categories.
 *
 * Matching is by EXACT folder name (one collection per real folder). Lowercasing
 * would collapse case-only-distinct sibling folders — e.g. `Tax` and `tax`, which
 * are separate directories on case-sensitive volumes — onto a single collection,
 * merging documents the on-disk layout means to keep apart.
 */
export function syncCategoriesToCollections(
  categories: string[],
): Map<string, string> {
  const existing = collectionsRepo.listAll();
  const byName = new Map(existing.map((c) => [c.name, c]));
  const result = new Map<string, string>();
  for (const name of categories) {
    const found = byName.get(name);
    if (found) {
      result.set(name, found.id);
    } else {
      const id = collectionsRepo.insert(name, null);
      byName.set(name, { id, name, description: null, created_at: "" });
      result.set(name, id);
    }
  }
  return result;
}

/** Find or create a single collection by exact folder name; returns its id. */
export function ensureCollectionForFolder(name: string): string {
  const existing = collectionsRepo.listAll().find((c) => c.name === name);
  return existing ? existing.id : collectionsRepo.insert(name, null);
}
