import { redirect } from "next/navigation";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { hasPermission } from "@/lib/auth/permissions";
import { isPlatformAdmin } from "@/lib/auth/platform";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import { AppShell, type NavItem } from "@/components/shell/app-shell";

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
  const [canViewWorkers, canViewEquipment, canViewProduction, canViewFuel, canViewMaintenance, canViewInventory, canViewExpenses, canViewCompliance, canViewSafety] = await Promise.all([
    hasPermission(organizationId, "worker.read"),
    hasPermission(organizationId, "equipment.read"),
    hasPermission(organizationId, "production.read"),
    hasPermission(organizationId, "fuel.read"),
    hasPermission(organizationId, "maintenance.read"),
    hasPermission(organizationId, "inventory.read"),
    hasPermission(organizationId, "expense.read"),
    hasPermission(organizationId, "compliance.read"),
    hasPermission(organizationId, "safety.read"),
  ]);
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
    ...(platformAdmin ? [{ href: "/admin", label: t(locale, "platformAdmin") }] : []),
  ];
  return <AppShell organizations={workspace.organizations} activeOrganization={workspace.activeOrganization} sites={workspace.sites} activeSite={workspace.activeSite} navItems={navItems} locale={locale}>{children}</AppShell>;
}
