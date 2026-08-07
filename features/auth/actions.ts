"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(12) });
export type AuthState = { error?: string; message?: string };

export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  const locale = await getLocale();
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t(locale, "authInvalid") };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: t(locale, "authSignInFailed") };
  redirect("/dashboard");
}

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  const locale = await getLocale();
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t(locale, "authInvalid") };
  const supabase = await createClient();
  const origin = (await import("next/headers")).headers().then((requestHeaders) => requestHeaders.get("origin") ?? "");
  const { error } = await supabase.auth.signUp({ ...parsed.data, options: { emailRedirectTo: `${await origin}/auth/callback?next=/onboarding` } });
  if (error) return { error: t(locale, "authSignUpFailed") };
  return { message: t(locale, "authConfirmEmail") };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
