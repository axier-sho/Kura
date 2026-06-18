"use server";

import { revalidatePath } from "next/cache";
import * as eventsRepo from "@/lib/db/repositories/events";

export async function updateEventStatus(formData: FormData): Promise<void> {
  const id = String(formData.get("event_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["open", "done", "dismissed"].includes(status)) return;

  eventsRepo.updateStatus(id, status as "open" | "done" | "dismissed");

  revalidatePath("/calendar");
}
