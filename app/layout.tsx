import type { Metadata, Viewport } from "next";
import { getLocale } from "@/lib/i18n/locale";
import "./globals.css";

export const metadata: Metadata = {
  // Each page sets its own title; this is the suffix and the fallback.
  title: { default: "Mantara", template: "%s · Mantara" },
  description: "Mining intelligence and operations platform.",
  applicationName: "Mantara",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/brand/mantara-mark.png", type: "image/png", sizes: "1254x1254" }],
    shortcut: ["/brand/mantara-mark.png"],
    apple: [{ url: "/brand/mantara-mark.png", type: "image/png", sizes: "1254x1254" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Mantara" },
};

export const viewport: Viewport = { themeColor: "#064e3b", colorScheme: "light" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The document language has to follow the chosen locale, or a screen reader announces Kiswahili
  // using English pronunciation rules and search engines index the page as the wrong language.
  const locale = await getLocale();
  return <html lang={locale}><body>{children}</body></html>;
}
