import { redirect } from "next/navigation";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { hasPermission } from "@/lib/auth/permissions";
import { isPlatformAdmin } from "@/lib/auth/platform";
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
  const [canViewWorkers, canViewEquipment, canViewProduction, canViewFuel, canViewMaintenance, canViewInventory, canViewExpenses] = await Promise.all([
    hasPermission(organizationId, "worker.read"),
    hasPermission(organizationId, "equipment.read"),
    hasPermission(organizationId, "production.read"),
    hasPermission(organizationId, "fuel.read"),
    hasPermission(organizationId, "maintenance.read"),
    hasPermission(organizationId, "inventory.read"),
    hasPermission(organizationId, "expense.read"),
  ]);
  const navItems: NavItem[] = [
    ...(canViewWorkers ? [{ href: "/workers", label: "Workers" }, { href: "/attendance", label: "Attendance" }] : []),
    ...(canViewEquipment ? [{ href: "/equipment", label: "Equipment" }] : []),
    ...(canViewProduction ? [{ href: "/shifts", label: "Shifts" }, { href: "/production", label: "Production" }] : []),
    ...(canViewFuel ? [{ href: "/fuel", label: "Fuel" }] : []),
    ...(canViewMaintenance ? [{ href: "/maintenance", label: "Maintenance" }] : []),
    ...(canViewInventory ? [{ href: "/inventory", label: "Inventory" }] : []),
    ...(canViewExpenses ? [{ href: "/expenses", label: "Expenses" }] : []),
    ...(platformAdmin ? [{ href: "/admin", label: "Platform admin" }] : []),
  ];
  return <AppShell organizations={workspace.organizations} activeOrganization={workspace.activeOrganization} sites={workspace.sites} activeSite={workspace.activeSite} navItems={navItems}>{children}</AppShell>;
}
