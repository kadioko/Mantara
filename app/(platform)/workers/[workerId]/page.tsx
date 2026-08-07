import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { AssignmentForm, PpeForm, TrainingForm, WorkerStatusForm } from "@/features/workers/worker-detail-forms";
import { EditWorkerForm, RemoveWorkerForm } from "@/features/workers/worker-edit-forms";

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
    <div className="border-b border-stone-200 px-5 py-4"><h2 className="font-bold">{title}</h2>{description && <p className="text-sm text-stone-600">{description}</p>}</div>
    <div className="p-5">{children}</div>
  </section>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-stone-600">{children}</p>;
}

export default async function WorkerDetailPage({ params }: { params: Promise<{ workerId: string }> }) {
  const { workerId } = await params;
  const workspace = await getActiveWorkspace();
  const organization = workspace.activeOrganization;
  const site = workspace.activeSite;
  if (!organization || !site || !await hasPermission(organization.id, "worker.read")) redirect("/dashboard");

  const { data: worker } = await workspace.supabase
    .from("workers")
    .select("id, full_name, employee_number, phone_number, job_title, employment_type, status, start_date, emergency_contact_name, emergency_contact_phone, notes")
    .eq("id", workerId)
    .eq("organization_id", organization.id)
    .eq("mine_site_id", site.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!worker) notFound();

  const [assignments, training, ppe, attendance] = await Promise.all([
    workspace.supabase.from("worker_assignments").select("id, assignment_name, starts_on, ends_on").eq("worker_id", workerId).order("starts_on", { ascending: false }),
    workspace.supabase.from("training_records").select("id, training_name, completed_on, expires_on").eq("worker_id", workerId).order("completed_on", { ascending: false }),
    workspace.supabase.from("ppe_issues").select("id, item_name, quantity, issued_on, returned_on").eq("worker_id", workerId).order("issued_on", { ascending: false }),
    workspace.supabase.from("attendance_records").select("id, attendance_date, status").eq("worker_id", workerId).order("attendance_date", { ascending: false }).limit(10),
  ]);

  const canManage = await hasPermission(organization.id, "worker.update");
  const today = new Date().toISOString().slice(0, 10);
  const details: Array<[string, string]> = [
    ["Employee number", worker.employee_number || "—"],
    ["Job title", worker.job_title || "—"],
    ["Employment type", worker.employment_type],
    ["Started", worker.start_date || "—"],
    ["Phone", worker.phone_number || "—"],
    ["Emergency contact", worker.emergency_contact_name ? `${worker.emergency_contact_name}${worker.emergency_contact_phone ? ` · ${worker.emergency_contact_phone}` : ""}` : "—"],
  ];

  return <div className="space-y-6">
    <div>
      <Link href="/workers" className="text-sm font-semibold text-emerald-800 hover:underline">← Back to workers</Link>
      <h1 className="mt-2 text-3xl font-bold">{worker.full_name}</h1>
      <p className="mt-1 capitalize text-stone-600">{worker.employment_type} · {worker.status} · {site.name}</p>
    </div>

    <Panel title="Profile">
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {details.map(([label, value]) => <div key={label}><dt className="text-sm text-stone-500">{label}</dt><dd className="font-medium capitalize">{value}</dd></div>)}
      </dl>
      {worker.notes && <p className="mt-4 rounded-lg bg-stone-50 p-3 text-sm text-stone-700">{worker.notes}</p>}
      {canManage && <div className="mt-5 space-y-5 border-t border-stone-100 pt-5">
        <WorkerStatusForm workerId={worker.id} status={worker.status} />
        <div className="border-t border-stone-100 pt-5"><EditWorkerForm worker={worker} /></div>
        <div className="border-t border-stone-100 pt-5"><RemoveWorkerForm workerId={worker.id} workerName={worker.full_name} /></div>
      </div>}
    </Panel>

    <Panel title="Assignments" description="Where this worker is deployed.">
      {canManage && <div className="mb-5 border-b border-stone-100 pb-5"><AssignmentForm workerId={worker.id} today={today} /></div>}
      {assignments.data?.length
        ? <ul className="divide-y divide-stone-100">{assignments.data.map((row) => <li key={row.id} className="flex flex-wrap justify-between gap-2 py-3"><span className="font-medium">{row.assignment_name || "Assignment"}</span><span className="text-sm text-stone-600">{row.starts_on} → {row.ends_on || "ongoing"}</span></li>)}</ul>
        : <Empty>No assignments recorded.</Empty>}
    </Panel>

    <Panel title="Training" description="Completed training and certificate expiry.">
      {canManage && <div className="mb-5 border-b border-stone-100 pb-5"><TrainingForm workerId={worker.id} today={today} /></div>}
      {training.data?.length
        ? <ul className="divide-y divide-stone-100">{training.data.map((row) => <li key={row.id} className="flex flex-wrap justify-between gap-2 py-3"><span className="font-medium">{row.training_name}</span><span className="text-sm text-stone-600">Completed {row.completed_on}{row.expires_on ? ` · expires ${row.expires_on}` : ""}</span></li>)}</ul>
        : <Empty>No training recorded.</Empty>}
    </Panel>

    <Panel title="PPE issued" description="Protective equipment issued to this worker.">
      {canManage && <div className="mb-5 border-b border-stone-100 pb-5"><PpeForm workerId={worker.id} today={today} /></div>}
      {ppe.data?.length
        ? <ul className="divide-y divide-stone-100">{ppe.data.map((row) => <li key={row.id} className="flex flex-wrap justify-between gap-2 py-3"><span className="font-medium">{row.item_name} × {row.quantity}</span><span className="text-sm text-stone-600">Issued {row.issued_on}{row.returned_on ? ` · returned ${row.returned_on}` : ""}</span></li>)}</ul>
        : <Empty>No PPE issued.</Empty>}
    </Panel>

    <Panel title="Recent attendance" description="Last 10 recorded days.">
      {attendance.data?.length
        ? <ul className="divide-y divide-stone-100">{attendance.data.map((row) => <li key={row.id} className="flex justify-between gap-2 py-3"><span className="font-medium">{row.attendance_date}</span><span className="text-sm capitalize text-stone-600">{row.status}</span></li>)}</ul>
        : <Empty>No attendance recorded yet.</Empty>}
    </Panel>
  </div>;
}
