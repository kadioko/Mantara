import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, ScrollText, ShieldCheck, LayoutDashboard, ArrowLeft } from "lucide-react";
import { signOut } from "@/features/auth/actions";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/organizations", label: "Organizations", icon: Building2 },
  { href: "/admin/administrators", label: "Administrators", icon: ShieldCheck },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
];

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { isAdmin } = await requirePlatformAdmin();
  // Everything under /admin is gated here as well as inside each database function, so a non-admin
  // reaching a URL directly never renders platform content.
  if (!isAdmin) redirect("/dashboard");

  return (
    <div className="min-h-screen md:grid md:grid-cols-[17rem_1fr]">
      <aside className="hidden border-r bg-card p-6 md:block">
        <p className="text-lg font-bold tracking-tight">Mantara</p>
        <p className="mt-0.5 text-sm text-muted-foreground">Platform administration</p>
        <nav aria-label="Platform navigation" className="mt-8 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-full justify-start gap-3")}
            >
              <item.icon aria-hidden />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 border-t pt-6">
          <Link href="/dashboard" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-full justify-start gap-3")}>
            <ArrowLeft aria-hidden />
            Back to workspace
          </Link>
        </div>
      </aside>

      <div>
        <header className="flex items-center justify-between gap-4 border-b bg-card px-5 py-3">
          <div>
            <p className="font-semibold">Platform administration</p>
            <p className="text-xs text-muted-foreground">Support and operations for Mantara itself</p>
          </div>
          <form action={signOut}>
            <Button variant="outline" size="sm">Sign out</Button>
          </form>
        </header>

        <nav aria-label="Platform navigation" className="flex gap-2 overflow-x-auto border-b bg-card px-4 py-2 md:hidden">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "shrink-0")}>
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="mx-auto max-w-6xl space-y-6 p-5 md:p-8">{children}</main>
      </div>
    </div>
  );
}
