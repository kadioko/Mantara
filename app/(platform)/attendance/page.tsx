import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { AttendanceForm, type AttendanceRow } from "@/features/workers/attendance-form";
import { attendanceRosterSchema } from "@/features/workers/schemas";

export const metadata = { title: "Attendance" };

function resolveDate(raw: string | string[] | undefined) {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  const today = new Date().toISOString().slice(0, 10);
  if (!candidate) return today;
  return attendanceRosterSchema.shape.date.safeParse(candidate).success ? candidate : today;
}

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string | string[] }> }) {
  const workspace = await getActiveWorkspace();
  if (!workspace.activeOrganization || !workspace.activeSite || !await hasPermission(workspace.activeOrganization.id, "worker.read")) redirect("/dashboard");
  const date = resolveDate((await searchParams).date);

  const { data: workers, error: workersError } = await workspace.supabase
    .from("workers")
    .select("id, full_name, job_title")
    .eq("organization_id", workspace.activeOrganization.id)
    .eq("mine_site_id", workspace.activeSite.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("full_name");
  if (workersError) throw new Error("Unable to load workers.");

  const { data: records, error: recordsError } = await workspace.supabase
    .from("attendance_records")
    .select("worker_id, status")
    .eq("organization_id", workspace.activeOrganization.id)
    .eq("mine_site_id", workspace.activeSite.id)
    .eq("attendance_date", date);
  if (recordsError) throw new Error("Unable to load attendance.");

  const statusByWorker = new Map((records ?? []).map((record) => [record.worker_id, record.status]));
  const rows: AttendanceRow[] = (workers ?? []).map((worker) => ({
    id: worker.id,
    fullName: worker.full_name,
    jobTitle: worker.job_title,
    status: statusByWorker.get(worker.id) ?? null,
  }));
  const canRecord = await hasPermission(workspace.activeOrganization.id, "worker.update");

  return <section>
    <p className="text-sm font-semibold tracking-wider text-accent-foreground">WORKFORCE</p>
    <h1 className="mt-2 text-3xl font-bold">Attendance</h1>
    <p className="mt-2 text-muted-foreground">Daily attendance for {workspace.activeSite.name}.</p>
    <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
      <label className="text-sm font-semibold">Date
        <input name="date" type="date" defaultValue={date} className="mt-1 block rounded-lg border border-input px-3 py-2" />
      </label>
      <button className="rounded-lg border border-input px-4 py-2 text-sm font-semibold">Load day</button>
    </form>
    <div className="mt-6">
      {canRecord
        ? <AttendanceForm date={date} workers={rows} />
        : <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4"><h2 className="font-bold">Attendance for {date}</h2><p className="text-sm text-muted-foreground">You can view but not record attendance.</p></div>
            {rows.length ? <div className="divide-y divide-border">{rows.map((worker) => <div key={worker.id} className="grid gap-1 p-4 md:grid-cols-[2fr_1fr]"><p className="font-semibold">{worker.fullName}</p><p className="text-sm capitalize text-muted-foreground">{worker.status ?? "not recorded"}</p></div>)}</div> : <p className="p-5 text-sm text-muted-foreground">No active workers are registered at this site yet.</p>}
          </div>}
    </div>
  </section>;
}
