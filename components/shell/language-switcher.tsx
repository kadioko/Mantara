import { setLocale } from "@/features/i18n/actions";
import { t, type Locale } from "@/lib/i18n/messages";

export function LanguageSwitcher({ locale, returnTo }: { locale: Locale; returnTo: string }) {
  return <form action={setLocale} className="flex items-center gap-2"><input type="hidden" name="returnTo" value={returnTo} /><label className="sr-only" htmlFor={`locale-${returnTo.replaceAll("/", "-")}`}>{t(locale, "language")}</label><select className="rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm font-medium text-stone-800" defaultValue={locale} id={`locale-${returnTo.replaceAll("/", "-")}`} name="locale"><option value="en">{t(locale, "english")}</option><option value="sw">{t(locale, "swahili")}</option></select><button className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold" type="submit">{t(locale, "save")}</button></form>;
}
