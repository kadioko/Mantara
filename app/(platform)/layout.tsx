import { redirect } from "next/navigation";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { hasPermission } from "@/lib/auth/permissions";
import { isPlatformAdmin } from "@/lib/auth/platform";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import { LocaleProvider } from "@/lib/i18n/client";
import { AppShell, type NavItem } from "@/components/shell/app-shell";
import { OfflineDraftProvider } from "@/lib/offline/encrypted-drafts";

export default async function PlatformLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const workspace = await getActiveWorkspace();
  const platformAdmin = await isPlatformAdmin();
  if (!workspace.activeOrganization) {
    // A platform administrator normally has no organization of their own, so onboarding would be the
    // wrong destination for them.
    redirect(platformAdmin ? "/admin" : "/onboarding");
  }
  const organizationId = workspace.activeOrganization.id;
  const locale = await getLocale();
  const [canViewWorkers, canViewEquipment, canViewProduction, canViewFuel, canViewMaintenance, canViewInventory, canViewExpenses, canViewCompliance, canViewSafety, canViewGeology, canViewAuditLog, canViewMembers, canViewSites, canViewOrganization, canViewRoles] = await Promise.all([
    hasPermission(organizationId, "worker.read"),
    hasPermission(organizationId, "equipment.read"),
    hasPermission(organizationId, "production.read"),
    hasPermission(organizationId, "fuel.read"),
    hasPermission(organizationId, "maintenance.read"),
    hasPermission(organizationId, "inventory.read"),
    hasPermission(organizationId, "expense.read"),
    hasPermission(organizationId, "compliance.read"),
    hasPermission(organizationId, "safety.read"),
    hasPermission(organizationId, "geology.read"),
    hasPermission(organizationId, "audit_log.read"),
    hasPermission(organizationId, "member.read"),
    hasPermission(organizationId, "site.read"),
    hasPermission(organizationId, "organization.read"),
    hasPermission(organizationId, "role.read"),
  ]);

  const [{ count: unreadCount }, canRunAnyReport] = await Promise.all([
    workspace.supabase.from("notifications").select("id", { count: "exact", head: true })
      .eq("user_id", workspace.user.id).is("read_at", null),
    Promise.resolve(canViewProduction || canViewFuel || canViewInventory || canViewExpenses),
  ]);
  const unread = unreadCount ?? 0;

  const navItems: NavItem[] = [
    ...(canViewWorkers ? [{ href: "/workers", label: t(locale, "workers") }, { href: "/attendance", label: t(locale, "attendance") }] : []),
    ...(canViewEquipment ? [{ href: "/equipment", label: t(locale, "equipment") }] : []),
    ...(canViewProduction ? [{ href: "/shifts", label: t(locale, "shifts") }, { href: "/production", label: t(locale, "production") }] : []),
    ...(canViewFuel ? [{ href: "/fuel", label: t(locale, "fuel") }] : []),
    ...(canViewMaintenance ? [{ href: "/maintenance", label: t(locale, "maintenance") }] : []),
    ...(canViewInventory ? [{ href: "/inventory", label: t(locale, "inventory") }] : []),
    ...(canViewExpenses ? [{ href: "/expenses", label: t(locale, "expenses") }] : []),
    ...(canViewCompliance ? [{ href: "/compliance", label: t(locale, "compliance") }] : []),
    ...(canViewSafety ? [{ href: "/safety", label: t(locale, "safety") }] : []),
    ...(canViewGeology ? [{ href: "/geology", label: t(locale, "geology") }] : []),
    ...(canViewProduction && canViewExpenses ? [{ href: "/intelligence", label: t(locale, "intelligence") }] : []),
    ...(canRunAnyReport ? [{ href: "/reports", label: t(locale, "reports") }] : []),
    { href: "/notifications", label: unread > 0 ? `${t(locale, "notifications")} (${unread})` : t(locale, "notifications") },
    ...(canViewSites ? [{ href: "/sites", label: t(locale, "mineSites") }] : []),
    ...(canViewMembers ? [{ href: "/settings/users", label: t(locale, "people") }] : []),
    ...(canViewOrganization ? [{ href: "/settings/organization", label: t(locale, "organization") }] : []),
    ...(canViewRoles ? [{ href: "/settings/roles", label: t(locale, "roles") }] : []),
    ...(canViewAuditLog ? [{ href: "/settings/audit-logs", label: t(locale, "auditLog") }] : []),
    ...(platformAdmin ? [{ href: "/admin", label: t(locale, "platformAdmin") }] : []),
  ];
  // The provider wraps the whole workspace so every client form below can read the locale without
  // it being threaded through as a prop.
  return (
    <LocaleProvider locale={locale}>
      <OfflineDraftProvider scope={{ userId: workspace.user.id, organizationId, siteId: workspace.activeSite?.id ?? "no-site" }}>
        <AppShell organizations={workspace.organizations} activeOrganization={workspace.activeOrganization} sites={workspace.sites} activeSite={workspace.activeSite} navItems={navItems} locale={locale}>{children}</AppShell>
      </OfflineDraftProvider>
    </LocaleProvider>
  );
}
