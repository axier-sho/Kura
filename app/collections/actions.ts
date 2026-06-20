"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as collectionsRepo from "@/lib/db/repositories/collections";

export async function createCollection(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const description = String(formData.get("description") ?? "").trim() || null;

  collectionsRepo.insert(name, description);

  revalidatePath("/collections");
}

export async function renameCollection(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;
  const description = String(formData.get("description") ?? "").trim() || null;

  collectionsRepo.rename(id, name, description);

  revalidatePath("/collections");
  revalidatePath(`/collections/${id}`);
}

export async function deleteCollection(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  collectionsRepo.remove(id);

  // The detail page for this id no longer exists; send the user back to the list.
  revalidatePath("/collections");
  redirect("/collections");
}
