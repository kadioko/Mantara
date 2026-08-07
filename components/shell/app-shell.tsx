import Link from "next/link";
import { MantaraLogo } from "@/components/brand/mantara-logo";
import { signOut } from "@/features/auth/actions";
import { t, type Locale } from "@/lib/i18n/messages";
import { LanguageSwitcher } from "./language-switcher";
import { WorkspaceSwitcher } from "./workspace-switcher";
import type { WorkspaceOrganization, WorkspaceSite } from "@/lib/auth/workspace";

/** Navigation entries are built by the layout, which resolves each label for the active locale. */
export type NavItem = { href: string; label: string };

export function AppShell({ organizations, activeOrganization, sites, activeSite, navItems, locale, children }: { organizations: WorkspaceOrganization[]; activeOrganization: WorkspaceOrganization; sites: WorkspaceSite[]; activeSite: WorkspaceSite | null; navItems: NavItem[]; locale: Locale; children: React.ReactNode }) {
  const switcher = <WorkspaceSwitcher organizations={organizations} activeOrganization={activeOrganization} sites={sites} activeSite={activeSite} locale={locale} />;
  return <div className="min-h-screen bg-stone-100 md:grid md:grid-cols-[18rem_1fr]">
    <aside className="hidden bg-emerald-950 p-6 text-white md:block">
      <MantaraLogo tone="dark" />
      <p className="mt-3 text-sm text-emerald-200">{t(locale, "miningOps")}</p>
      {/* Light text by default: anything inheriting the old near-black green here was unreadable. */}
      <div className="mt-8 rounded-xl bg-emerald-900 p-3 text-emerald-50 shadow-inner">{switcher}</div>
      <nav aria-label="Main navigation" className="mt-8 space-y-1">
        <Link className="block rounded-lg bg-emerald-900 px-3 py-3 font-semibold shadow-sm" href="/dashboard">{t(locale, "dashboard")}</Link>
        {navItems.map((item) => (
          <Link key={item.href} className="block rounded-lg px-3 py-3 font-semibold transition hover:bg-emerald-900" href={item.href}>{item.label}</Link>
        ))}
      </nav>
    </aside>
    <div>
      <header className="flex items-center justify-between gap-4 border-b border-stone-200 bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <MantaraLogo compact />
          <p className="hidden text-xs text-stone-500 sm:block">{activeOrganization.name}{activeSite ? ` · ${activeSite.name}` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher locale={locale} returnTo="/dashboard" />
          <form action={signOut}><button className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold">{t(locale, "signOut")}</button></form>
        </div>
      </header>
      <details className="border-b border-stone-200 bg-white p-4 md:hidden">
        <summary className="cursor-pointer font-semibold">{t(locale, "switchWorkspace")}</summary>
        {/* Same dark panel as the sidebar: the switcher states its colours for that background, so
            dropping it onto white here would make its labels unreadable instead. */}
        <div className="mt-4 rounded-xl bg-emerald-900 p-3 text-emerald-50 shadow-inner">{switcher}</div>
        <nav aria-label="Main navigation" className="mt-4 grid grid-cols-2 gap-2">
          <Link className="rounded-lg border border-stone-300 px-3 py-3 text-center font-semibold" href="/dashboard">{t(locale, "dashboard")}</Link>
          {navItems.map((item) => (
            <Link key={item.href} className="rounded-lg bg-emerald-800 px-3 py-3 text-center font-semibold text-white" href={item.href}>{item.label}</Link>
          ))}
        </nav>
      </details>
      <main className="mx-auto max-w-7xl p-5 md:p-8">{children}</main>
    </div>
  </div>;
}
