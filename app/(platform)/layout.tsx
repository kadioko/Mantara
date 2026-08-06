import { redirect } from "next/navigation";
import { currentMembership } from "@/lib/auth/context";
import { AppShell } from "@/components/shell/app-shell";

export default async function PlatformLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { membership } = await currentMembership();
  if (!membership) redirect("/onboarding");
  const organization = Array.isArray(membership.organization) ? membership.organization[0] : membership.organization;
  return <AppShell organizationName={organization?.name ?? "Mantara"}>{children}</AppShell>;
}
