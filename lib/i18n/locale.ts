import { cookies } from "next/headers";
import { supportedLocales, type Locale } from "./messages";

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get("mantara-locale")?.value;
  return supportedLocales.includes(value as Locale) ? value as Locale : "en";
}
