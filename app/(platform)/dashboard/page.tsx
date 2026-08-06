import { currentMembership } from "@/lib/auth/context";

export default async function DashboardPage() {
  const { membership } = await currentMembership();
  const organization = Array.isArray(membership?.organization) ? membership?.organization[0] : membership?.organization;
  return <section><p className="text-sm font-semibold tracking-wider text-amber-700">MANTARA OS</p><h1 className="mt-2 text-3xl font-bold">{organization?.name ?? "Your workspace"}</h1><p className="mt-3 max-w-2xl text-stone-600">Your secure organization, membership, mine-site, and permission foundation is ready. Operational dashboard data will appear as each module is implemented.</p><div className="mt-8 rounded-xl border border-dashed border-stone-300 bg-white p-6"><h2 className="font-bold">Foundation complete</h2><p className="mt-2 text-sm text-stone-600">Next: application navigation and the Workers module.</p></div></section>;
}
