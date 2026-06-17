"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth";

export async function updateEventStatus(formData: FormData): Promise<void> {
  const { supabase, orgId } = await getSessionContext();
  if (!supabase || !orgId) return;

  const id = String(formData.get("event_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["open", "done", "dismissed"].includes(status)) return;

  const { error } = await supabase
    .from("events")
    .update({ status })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`ステータスの更新に失敗しました: ${error.message}`);
  }

  revalidatePath("/calendar");
}
