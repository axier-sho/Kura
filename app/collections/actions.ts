"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth";

export async function createCollection(formData: FormData): Promise<void> {
  const { supabase, orgId } = await getSessionContext();
  if (!supabase || !orgId) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const description = String(formData.get("description") ?? "").trim() || null;

  await supabase
    .from("collections")
    .insert({ org_id: orgId, name, description });

  revalidatePath("/collections");
}
