import { getActiveWorkspace } from "@/lib/auth/workspace";

export default async function DashboardPage() {
  const workspace = await getActiveWorkspace();
  return <section><p className="text-sm font-semibold tracking-wider text-amber-700">MANTARA OS</p><h1 className="mt-2 text-3xl font-bold">{workspace.activeOrganization?.name ?? "Your workspace"}</h1><p className="mt-3 max-w-2xl text-stone-600">{workspace.activeSite ? `Current mine site: ${workspace.activeSite.name}. ` : ""}Your secure organization, membership, mine-site, and permission foundation is ready. Operational dashboard data will appear as each module is implemented.</p><div className="mt-8 rounded-xl border border-dashed border-stone-300 bg-white p-6"><h2 className="font-bold">Workspace shell in progress</h2><p className="mt-2 text-sm text-stone-600">Organization and mine-site context are selected securely. Next: Workers and attendance.</p></div></section>;
}
