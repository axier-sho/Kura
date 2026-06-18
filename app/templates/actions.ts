"use server";

import { revalidatePath } from "next/cache";
import * as templatesRepo from "@/lib/db/repositories/templates";

export async function createTemplate(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const docType = String(formData.get("doc_type") ?? "").trim() || null;
  const body = String(formData.get("body") ?? "");

  templatesRepo.insert(name, docType, body);

  revalidatePath("/templates");
}
