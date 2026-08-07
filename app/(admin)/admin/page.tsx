import Link from "next/link";
import { Building2, ShieldAlert, Users, MapPin, ShieldCheck } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, PageHeader, StatCard } from "@/components/ui/feedback";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Platform overview" };

type Stats = { organizations: number; suspended: number; users: number; sites: number; admins: number };

export default async function AdminOverviewPage() {
  const { supabase } = await requirePlatformAdmin();
  const { data } = await supabase.rpc("platform_stats");
  const stats = (Array.isArray(data) ? data[0] : data) as Stats | undefined;

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Overview"
        description="Tenancy health across every organization on Mantara."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Organizations" value={stats?.organizations ?? 0} />
        <StatCard label="Suspended" value={stats?.suspended ?? 0} tone={(stats?.suspended ?? 0) > 0 ? "warning" : "default"} />
        <StatCard label="Mine sites" value={stats?.sites ?? 0} />
        <StatCard label="Registered users" value={stats?.users ?? 0} />
      </div>

      <Alert variant="info">
        <p className="font-medium">Platform administration does not include tenant data.</p>
        <p className="mt-1">
          This role sees organization metadata and counts only. Workers, production, fuel, inventory, maintenance,
          and expense records stay reachable exclusively through membership of the organization that owns them, so
          holding this role grants no way to read a customer&rsquo;s operational data.
        </p>
      </Alert>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="size-4" aria-hidden />Organizations</CardTitle>
            <CardDescription>Review tenants and suspend or restore access.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/organizations" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Open</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4" aria-hidden />Administrators</CardTitle>
            <CardDescription>{stats?.admins ?? 0} with platform access.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/administrators" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Manage</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldAlert className="size-4" aria-hidden />Audit log</CardTitle>
            <CardDescription>Every platform action, append only.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/audit" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Review</Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-xl border bg-card p-5">
          <Users className="size-5 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-sm text-muted-foreground">Average members per organization</p>
            <p className="text-lg font-semibold tabular-nums">
              {stats && stats.organizations > 0 ? (stats.users / stats.organizations).toFixed(1) : "0"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-card p-5">
          <MapPin className="size-5 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-sm text-muted-foreground">Average sites per organization</p>
            <p className="text-lg font-semibold tabular-nums">
              {stats && stats.organizations > 0 ? (stats.sites / stats.organizations).toFixed(1) : "0"}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
