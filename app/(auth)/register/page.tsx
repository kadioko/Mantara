import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { MantaraLogo } from "@/components/brand/mantara-logo";
import { AuthForm } from "@/features/auth/auth-form";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";

export const metadata = { title: "Create account" };

export default async function RegisterPage() {
  const locale = await getLocale();
  return (
    <section className="w-full rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <div className="lg:hidden"><MantaraLogo size={36} /></div>
        <div className="ml-auto"><LanguageSwitcher locale={locale} returnTo="/register" /></div>
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight sm:text-3xl">{t(locale, "createAccountTitle")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t(locale, "createAccountDescription")}</p>
      <AuthForm locale={locale} mode="register" />
    </section>
  );
}
