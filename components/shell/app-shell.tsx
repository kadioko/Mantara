import Link from "next/link";
import { signOut } from "@/features/auth/actions";
import { WorkspaceSwitcher } from "./workspace-switcher";
import type { WorkspaceOrganization, WorkspaceSite } from "@/lib/auth/workspace";

export type NavItem = { href: string; label: string };

export function AppShell({ organizations, activeOrganization, sites, activeSite, navItems, children }: { organizations: WorkspaceOrganization[]; activeOrganization: WorkspaceOrganization; sites: WorkspaceSite[]; activeSite: WorkspaceSite | null; navItems: NavItem[]; children: React.ReactNode }) {
  const switcher = <WorkspaceSwitcher organizations={organizations} activeOrganization={activeOrganization} sites={sites} activeSite={activeSite} />;
  return <div className="min-h-screen md:grid md:grid-cols-[18rem_1fr]">
    <aside className="hidden bg-emerald-950 p-6 text-white md:block">
      <p className="text-xl font-bold tracking-wide">Mantara</p>
      <p className="mt-1 text-sm text-emerald-200">Mining intelligence and operations</p>
      <div className="mt-8 rounded-lg bg-emerald-900 p-3 text-emerald-950">{switcher}</div>
      <nav aria-label="Main navigation" className="mt-8 space-y-1">
        <Link className="block rounded-lg bg-emerald-900 px-3 py-3 font-semibold" href="/dashboard">Dashboard</Link>
        {navItems.map((item) => <Link key={item.href} className="block rounded-lg px-3 py-3 font-semibold hover:bg-emerald-900" href={item.href}>{item.label}</Link>)}
      </nav>
    </aside>
    <div>
      <header className="flex items-center justify-between gap-4 border-b border-stone-200 bg-white px-5 py-4">
        <div><p className="font-bold">Mantara</p><p className="text-xs text-stone-500">{activeOrganization.name}{activeSite ? ` · ${activeSite.name}` : ""}</p></div>
        <form action={signOut}><button className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold">Sign out</button></form>
      </header>
      <details className="border-b border-stone-200 bg-white p-4 md:hidden">
        <summary className="cursor-pointer font-semibold">Menu</summary>
        <div className="mt-4">{switcher}</div>
        <nav aria-label="Main navigation" className="mt-4 space-y-2">
          <Link className="block rounded-lg border border-stone-300 px-3 py-3 text-center font-semibold" href="/dashboard">Dashboard</Link>
          {navItems.map((item) => <Link key={item.href} className="block rounded-lg border border-stone-300 px-3 py-3 text-center font-semibold" href={item.href}>{item.label}</Link>)}
        </nav>
      </details>
      <main className="mx-auto max-w-7xl p-5 md:p-8">{children}</main>
    </div>
  </div>;
}
