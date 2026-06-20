"use server";

import { revalidatePath } from "next/cache";
import * as templatesRepo from "@/lib/db/repositories/templates";

export async function createTemplate(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  // Require both: an empty body silently produced a title-only .docx on generate.
  if (!name || !body) return;
  const docType = String(formData.get("doc_type") ?? "").trim() || null;

  templatesRepo.insert(name, docType, body);

  revalidatePath("/templates");
}

export async function updateTemplate(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!id || !name || !body) return;
  const docType = String(formData.get("doc_type") ?? "").trim() || null;

  templatesRepo.update(id, name, docType, body);

  revalidatePath("/templates");
}

export async function deleteTemplate(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  templatesRepo.deleteById(id);

  revalidatePath("/templates");
}
