"use client";

import { createContext, useContext, useMemo } from "react";
import { t, type Locale, type MessageKey } from "./messages";

/**
 * Makes the active locale available to client components.
 *
 * This is why the forms were English while the pages around them were bilingual. `getLocale()` reads
 * a cookie, which only a server component can do, so every `"use client"` form — which is all of the
 * data-entry forms in the product — had no way to reach it. The alternative was passing a locale
 * prop into every form and down through every field, which nobody would have kept up.
 *
 * That gap was exactly backwards for this product. A supervisor at a mine site in Tanzania fills in
 * the forms; the landing pages are read far less often and by people more likely to read English.
 *
 * The locale is resolved once on the server and handed down. There is no fetching and no state, so
 * this costs a single context read per component.
 */
const LocaleContext = createContext<Locale>("en");

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/**
 * Returns a translate function bound to the active locale.
 *
 * Defaults to English if a component ends up outside the provider — a form rendering in English is
 * a cosmetic problem, and throwing here would turn it into a blank screen.
 */
export function useT() {
  const locale = useContext(LocaleContext);
  return useMemo(
    () => (key: MessageKey, values?: Record<string, string>) => t(locale, key, values),
    [locale],
  );
}

/** The active locale itself, for the rare component that needs it for formatting rather than text. */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}
