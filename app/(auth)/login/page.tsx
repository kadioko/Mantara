import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { MantaraLogo } from "@/components/brand/mantara-logo";
import { AuthForm } from "@/features/auth/auth-form";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const locale = await getLocale();
  return (
    <section className="w-full rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      {/*
        The mark repeats here only below lg, where the brand column beside this card is hidden.
        Showing it in both places at once would be the same logo twice on one screen.
      */}
      <div className="flex items-center justify-between gap-3">
        <div className="lg:hidden"><MantaraLogo size={36} /></div>
        <div className="ml-auto"><LanguageSwitcher locale={locale} returnTo="/login" /></div>
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight sm:text-3xl">{t(locale, "welcomeBack")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t(locale, "signInDescription")}</p>
      <AuthForm locale={locale} mode="login" />
    </section>
  );
}
