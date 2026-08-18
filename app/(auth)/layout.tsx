import { MantaraLogo } from "@/components/brand/mantara-logo";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import { ShieldCheck, ClipboardCheck, FileCheck2 } from "lucide-react";

/**
 * The frame around signing in, registering and onboarding.
 *
 * It was a bare 448px column holding a single card, so the first thing anyone saw of Mantara was a
 * form and nothing else — no indication of what the product is, and a logo small enough to be
 * mistaken for an artefact.
 *
 * Two columns from `lg` up: what this is on the left, what to do on the right. Below that the brand
 * panel collapses to a compact header, because a supervisor signing in on a phone at a mine site
 * wants the form immediately, not a pitch.
 *
 * Every colour is a token, so this follows the theme rather than pinning a palette.
 */
export default async function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const points = [
    { icon: ClipboardCheck, text: t(locale, "authPointRecords") },
    { icon: FileCheck2, text: t(locale, "authPointCompliance") },
    { icon: ShieldCheck, text: t(locale, "authPointPrivacy") },
  ];

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-5 py-10 lg:grid-cols-[1.05fr_minmax(0,26rem)] lg:gap-16 lg:py-16">
        {/* The brand half. Hidden below lg, where the compact header inside the card takes over. */}
        <section className="hidden lg:block">
          <MantaraLogo size={56} />
          <h2 className="mt-8 text-4xl font-bold leading-tight tracking-tight">{t(locale, "authTagline")}</h2>
          <p className="mt-4 max-w-lg text-lg text-muted-foreground">{t(locale, "authPitch")}</p>

          <ul className="mt-10 space-y-4">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="text-sm text-foreground">{text}</span>
              </li>
            ))}
          </ul>

          <p className="mt-10 max-w-md border-l-2 border-border pl-4 text-xs leading-relaxed text-muted-foreground">
            {t(locale, "authYourDataNote")}
          </p>
        </section>

        <div className="w-full justify-self-center lg:justify-self-end">{children}</div>
      </div>
    </main>
  );
}
