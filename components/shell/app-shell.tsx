import { MantaraLogo } from "@/components/brand/mantara-logo";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { t, type Locale } from "@/lib/i18n/messages";
import { CollapsibleWorkspaceFrame } from "./collapsible-workspace-frame";
import { LanguageSwitcher } from "./language-switcher";
import { NavigationLinks } from "./navigation-links";
import { WorkspaceSwitcher } from "./workspace-switcher";
import type { WorkspaceOrganization, WorkspaceSite } from "@/lib/auth/workspace";

/** Navigation entries are built by the layout, which resolves each label for the active locale. */
export type NavItem = { href: string; label: string };

export function AppShell({ organizations, activeOrganization, sites, activeSite, navItems, locale, children }: { organizations: WorkspaceOrganization[]; activeOrganization: WorkspaceOrganization; sites: WorkspaceSite[]; activeSite: WorkspaceSite | null; navItems: NavItem[]; locale: Locale; children: React.ReactNode }) {
  const switcher = <WorkspaceSwitcher organizations={organizations} activeOrganization={activeOrganization} sites={sites} activeSite={activeSite} locale={locale} />;
  const allNavItems: NavItem[] = [{ href: "/dashboard", label: t(locale, "dashboard") }, ...navItems];
  const sidebar = <>
    <MantaraLogo tone="dark" />
    <p className="mt-2 text-xs font-medium tracking-wide text-emerald-200">{t(locale, "miningOps")}</p>
    <div className="mt-7 rounded-2xl border border-emerald-700/70 bg-emerald-950/35 p-3 text-emerald-50 shadow-[0_16px_36px_-24px_rgba(0,0,0,0.85)]">{switcher}</div>
    <div className="mt-7 border-t border-emerald-800/80 pt-5"><NavigationLinks items={allNavItems} /></div>
  </>;
  const leading = <div className="flex min-w-0 items-center gap-3">
    <MantaraLogo compact />
    <div className="hidden min-w-0 sm:block"><p className="truncate text-sm font-semibold text-foreground">{activeOrganization.name}</p><p className="truncate text-xs text-muted-foreground">{activeSite?.name ?? t(locale, "currentMineSite")}</p></div>
  </div>;
  const actions = <div className="flex shrink-0 items-center gap-2">
    <LanguageSwitcher locale={locale} returnTo="/dashboard" />
    <SignOutButton label={t(locale, "signOut")} className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold transition hover:bg-secondary" />
  </div>;
  const mobileNavigation = <details className="border-b border-border bg-card p-4 md:hidden">
    <summary className="cursor-pointer font-semibold">{t(locale, "switchWorkspace")}</summary>
    <div className="mt-4 rounded-xl bg-emerald-900 p-3 text-emerald-50 shadow-inner">{switcher}</div>
    <div className="mt-4"><NavigationLinks items={allNavItems} mobile /></div>
  </details>;

  return <CollapsibleWorkspaceFrame sidebar={sidebar} leading={leading} actions={actions} mobileNavigation={mobileNavigation}
    collapseLabel={t(locale, "collapseSidebar")} expandLabel={t(locale, "expandSidebar")} offlineLabel={t(locale, "offline")}>{children}</CollapsibleWorkspaceFrame>;
}
