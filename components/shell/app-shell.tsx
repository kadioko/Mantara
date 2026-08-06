import Link from "next/link";
import { signOut } from "@/features/auth/actions";

export function AppShell({ organizationName, children }: { organizationName: string; children: React.ReactNode }) {
  return <div className="min-h-screen md:grid md:grid-cols-[16rem_1fr]"><aside className="hidden bg-emerald-950 p-6 text-white md:block"><p className="text-xl font-bold tracking-wide">Mantara</p><p className="mt-1 text-sm text-emerald-200">{organizationName}</p><nav className="mt-10 space-y-1"><Link className="block rounded-lg bg-emerald-900 px-3 py-3" href="/dashboard">Dashboard</Link><span className="block px-3 py-3 text-sm text-emerald-300">Operational modules are coming next.</span></nav></aside><div><header className="flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4"><p className="font-bold md:hidden">Mantara</p><p className="hidden text-sm text-stone-500 md:block">{organizationName}</p><form action={signOut}><button className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold">Sign out</button></form></header><main className="mx-auto max-w-7xl p-5 md:p-8">{children}</main></div></div>;
}
