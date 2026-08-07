"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supportedLocales, type Locale } from "@/lib/i18n/messages";

export async function setLocale(formData: FormData) {
  const locale = formData.get("locale");
  const returnTo = formData.get("returnTo");
  if (!supportedLocales.includes(locale as Locale)) return;
  const selectedLocale = locale as Locale;
  (await cookies()).set("mantara-locale", selectedLocale, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect(typeof returnTo === "string" && returnTo.startsWith("/") ? returnTo : "/dashboard");
}
