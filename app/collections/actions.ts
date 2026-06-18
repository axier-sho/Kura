"use server";

import { revalidatePath } from "next/cache";
import * as collectionsRepo from "@/lib/db/repositories/collections";

export async function createCollection(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const description = String(formData.get("description") ?? "").trim() || null;

  collectionsRepo.insert(name, description);

  revalidatePath("/collections");
}
