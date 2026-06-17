"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth";

export async function createTemplate(formData: FormData): Promise<void> {
  const { supabase, orgId } = await getSessionContext();
  if (!supabase || !orgId) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const docType = String(formData.get("doc_type") ?? "").trim() || null;
  const body = String(formData.get("body") ?? "");

  const { error } = await supabase
    .from("templates")
    .insert({ org_id: orgId, name, doc_type: docType, body });

  if (error) {
    throw new Error(`テンプレートの作成に失敗しました: ${error.message}`);
  }

  revalidatePath("/templates");
}
