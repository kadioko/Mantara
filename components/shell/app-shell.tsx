import { MantaraLogo } from "@/components/brand/mantara-logo";
import { signOut } from "@/features/auth/actions";
import { t, type Locale } from "@/lib/i18n/messages";
import { LanguageSwitcher } from "./language-switcher";
import { NavigationLinks } from "./navigation-links";
import { WorkspaceSwitcher } from "./workspace-switcher";
import type { WorkspaceOrganization, WorkspaceSite } from "@/lib/auth/workspace";

/** Navigation entries are built by the layout, which resolves each label for the active locale. */
export type NavItem = { href: string; label: string };

export function AppShell({ organizations, activeOrganization, sites, activeSite, navItems, locale, children }: { organizations: WorkspaceOrganization[]; activeOrganization: WorkspaceOrganization; sites: WorkspaceSite[]; activeSite: WorkspaceSite | null; navItems: NavItem[]; locale: Locale; children: React.ReactNode }) {
  const switcher = <WorkspaceSwitcher organizations={organizations} activeOrganization={activeOrganization} sites={sites} activeSite={activeSite} locale={locale} />;
  const allNavItems: NavItem[] = [{ href: "/dashboard", label: t(locale, "dashboard") }, ...navItems];
  return <div className="min-h-screen bg-background md:grid md:grid-cols-[17rem_minmax(0,1fr)]">
    <aside className="hidden h-screen overflow-y-auto border-r border-emerald-900 bg-[linear-gradient(165deg,#022c22_0%,#064e3b_55%,#042f2e_100%)] p-5 text-white md:sticky md:top-0 md:block">
      <MantaraLogo tone="dark" />
      <p className="mt-2 text-xs font-medium tracking-wide text-emerald-200">{t(locale, "miningOps")}</p>
      {/* Light text by default: anything inheriting the old near-black green here was unreadable. */}
      <div className="mt-7 rounded-2xl border border-emerald-700/70 bg-emerald-950/35 p-3 text-emerald-50 shadow-[0_16px_36px_-24px_rgba(0,0,0,0.85)]">{switcher}</div>
      <div className="mt-7 border-t border-emerald-800/80 pt-5"><NavigationLinks items={allNavItems} /></div>
    </aside>
    <div className="min-w-0">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-border/80 bg-background/90 px-5 py-3.5 backdrop-blur md:px-8">
        <div className="flex items-center gap-3">
          <MantaraLogo compact />
          <p className="hidden text-xs text-stone-500 sm:block">{activeOrganization.name}{activeSite ? ` · ${activeSite.name}` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher locale={locale} returnTo="/dashboard" />
          <form action={signOut}><button className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold">{t(locale, "signOut")}</button></form>
        </div>
      </header>
      <details className="border-b border-border bg-card p-4 md:hidden">
        <summary className="cursor-pointer font-semibold">{t(locale, "switchWorkspace")}</summary>
        {/* Same dark panel as the sidebar: the switcher states its colours for that background, so
            dropping it onto white here would make its labels unreadable instead. */}
        <div className="mt-4 rounded-xl bg-emerald-900 p-3 text-emerald-50 shadow-inner">{switcher}</div>
        <div className="mt-4"><NavigationLinks items={allNavItems} mobile /></div>
      </details>
      <main className="mx-auto max-w-7xl p-5 pb-10 md:p-8 md:pb-12">{children}</main>
    </div>
  </div>;
}
