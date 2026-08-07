"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/context";

const markReadSchema = z.object({ notificationId: z.string().uuid() });

/**
 * Notifications belong to one person. RLS restricts both reading and updating to the recipient, so
 * these cannot touch anyone else's whatever id is submitted. They are plain form actions rather than
 * useActionState reducers because the page needs no feedback beyond the row disappearing.
 */
export async function markNotificationRead(formData: FormData): Promise<void> {
  const parsed = markReadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { supabase, user } = await requireUser();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", parsed.data.notificationId)
    .eq("user_id", user.id)
    .is("read_at", null);
  revalidatePath("/notifications");
}

export async function markAllNotificationsRead(): Promise<void> {
  const { supabase, user } = await requireUser();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  revalidatePath("/notifications");
}
