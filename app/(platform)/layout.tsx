import { redirect } from "next/navigation";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { hasPermission } from "@/lib/auth/permissions";
import { getLocale } from "@/lib/i18n/locale";
import { AppShell } from "@/components/shell/app-shell";

export default async function PlatformLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const workspace = await getActiveWorkspace();
  if (!workspace.activeOrganization) redirect("/onboarding");
  const canViewWorkers = await hasPermission(workspace.activeOrganization.id, "worker.read");
  const locale = await getLocale();
  return <AppShell organizations={workspace.organizations} activeOrganization={workspace.activeOrganization} sites={workspace.sites} activeSite={workspace.activeSite} canViewWorkers={canViewWorkers} locale={locale}>{children}</AppShell>;
}
