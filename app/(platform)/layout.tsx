import { redirect } from "next/navigation";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { hasPermission } from "@/lib/auth/permissions";
import { AppShell, type NavItem } from "@/components/shell/app-shell";

export default async function PlatformLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const workspace = await getActiveWorkspace();
  if (!workspace.activeOrganization) redirect("/onboarding");
  const organizationId = workspace.activeOrganization.id;
  const [canViewWorkers, canViewEquipment, canViewProduction, canViewFuel, canViewMaintenance, canViewInventory] = await Promise.all([
    hasPermission(organizationId, "worker.read"),
    hasPermission(organizationId, "equipment.read"),
    hasPermission(organizationId, "production.read"),
    hasPermission(organizationId, "fuel.read"),
    hasPermission(organizationId, "maintenance.read"),
    hasPermission(organizationId, "inventory.read"),
  ]);
  const navItems: NavItem[] = [
    ...(canViewWorkers ? [{ href: "/workers", label: "Workers" }, { href: "/attendance", label: "Attendance" }] : []),
    ...(canViewEquipment ? [{ href: "/equipment", label: "Equipment" }] : []),
    ...(canViewProduction ? [{ href: "/shifts", label: "Shifts" }, { href: "/production", label: "Production" }] : []),
    ...(canViewFuel ? [{ href: "/fuel", label: "Fuel" }] : []),
    ...(canViewMaintenance ? [{ href: "/maintenance", label: "Maintenance" }] : []),
    ...(canViewInventory ? [{ href: "/inventory", label: "Inventory" }] : []),
  ];
  return <AppShell organizations={workspace.organizations} activeOrganization={workspace.activeOrganization} sites={workspace.sites} activeSite={workspace.activeSite} navItems={navItems}>{children}</AppShell>;
}
