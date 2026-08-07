import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n/locale";
import "./globals.css";

export const metadata: Metadata = {
  // Each page sets its own title; this is the suffix and the fallback.
  title: { default: "Mantara", template: "%s · Mantara" },
  description: "Mining intelligence and operations platform.",
  icons: { icon: "/brand/mantara-mark.png", apple: "/brand/mantara-mark.png" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The document language has to follow the chosen locale, or a screen reader announces Kiswahili
  // using English pronunciation rules and search engines index the page as the wrong language.
  const locale = await getLocale();
  return <html lang={locale}><body>{children}</body></html>;
}
