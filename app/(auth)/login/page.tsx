import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { MantaraLogo } from "@/components/brand/mantara-logo";
import { AuthForm } from "@/features/auth/auth-form";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const locale = await getLocale();
  return <section className="w-full rounded-2xl bg-card p-7 shadow-sm"><div className="flex items-center justify-between gap-3"><MantaraLogo /><LanguageSwitcher locale={locale} returnTo="/login" /></div><h1 className="mt-6 text-3xl font-bold">{t(locale, "welcomeBack")}</h1><p className="mt-2 text-muted-foreground">{t(locale, "signInDescription")}</p><AuthForm locale={locale} mode="login" /></section>;
}
