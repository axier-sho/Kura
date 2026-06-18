/**
 * Keep the DB `collections` table in sync with the working directory's real
 * subfolders. Each category subfolder maps to a collection of the same name so
 * the rest of the app (collections pages, search, review) keeps working.
 */
import * as collectionsRepo from "@/lib/db/repositories/collections";

/**
 * Ensure a collection row exists for every category folder. Returns a map from
 * folder name to collection id for all given categories. Matching is
 * case-insensitive on name.
 */
export function syncCategoriesToCollections(
  categories: string[],
): Map<string, string> {
  const existing = collectionsRepo.listAll();
  const byLowerName = new Map(existing.map((c) => [c.name.toLowerCase(), c]));
  const result = new Map<string, string>();
  for (const name of categories) {
    const found = byLowerName.get(name.toLowerCase());
    if (found) {
      result.set(name, found.id);
    } else {
      const id = collectionsRepo.insert(name, null);
      byLowerName.set(name.toLowerCase(), { id, name, description: null, created_at: "" });
      result.set(name, id);
    }
  }
  return result;
}

/** Find or create a single collection by folder name; returns its id. */
export function ensureCollectionForFolder(name: string): string {
  const existing = collectionsRepo
    .listAll()
    .find((c) => c.name.toLowerCase() === name.toLowerCase());
  return existing ? existing.id : collectionsRepo.insert(name, null);
}
