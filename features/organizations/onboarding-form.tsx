"use client";

import { useActionState } from "react";
import { t, type Locale } from "@/lib/i18n/messages";
import { createOrganization, type OnboardingState } from "./actions";

export function OnboardingForm({ locale }: { locale: Locale }) {
  const [state, action, pending] = useActionState(createOrganization, {} as OnboardingState);
  return <form action={action} className="mt-8 space-y-5"><label className="block text-sm font-semibold">{t(locale, "organizationName")}<input name="organizationName" required maxLength={120} className="mt-2 w-full rounded-lg border border-input px-3 py-3" placeholder="Mantara Mining Ltd" /></label><label className="block text-sm font-semibold">{t(locale, "firstMineSite")}<input name="siteName" required maxLength={120} className="mt-2 w-full rounded-lg border border-input px-3 py-3" placeholder="Nyamongo Site" /></label><label className="block text-sm font-semibold">{t(locale, "countryCode")}<input name="country" required defaultValue="TZ" minLength={2} maxLength={2} className="mt-2 w-full rounded-lg border border-input px-3 py-3 uppercase" /></label>{state.error && <p role="alert" className="rounded-lg bg-destructive/12 p-3 text-sm text-destructive">{state.error}</p>}<button disabled={pending} className="w-full rounded-lg bg-primary px-4 py-3 font-semibold text-white disabled:opacity-60">{pending ? t(locale, "creating") : t(locale, "createOrganization")}</button></form>;
}
