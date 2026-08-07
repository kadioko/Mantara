import { redirect } from "next/navigation";
import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { MantaraLogo } from "@/components/brand/mantara-logo";
import { OnboardingForm } from "@/features/organizations/onboarding-form";
import { currentMembership } from "@/lib/auth/context";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";

export default async function OnboardingPage() {
  const { membership } = await currentMembership();
  if (membership) redirect("/dashboard");
  const locale = await getLocale();
  return <main className="mx-auto flex min-h-screen max-w-md items-center px-5 py-10"><section className="w-full rounded-2xl bg-white p-7 shadow-sm"><div className="flex items-center justify-between gap-3"><MantaraLogo /><LanguageSwitcher locale={locale} returnTo="/onboarding" /></div><h1 className="mt-6 text-3xl font-bold">{t(locale, "setupWorkspace")}</h1><p className="mt-2 text-stone-600">{t(locale, "setupDescription")}</p><OnboardingForm locale={locale} /></section></main>;
}
