"use client";

import { useActionState } from "react";
import { saveAttendance, type WorkerState } from "./actions";
import { attendanceStatuses } from "./schemas";

export type AttendanceRow = { id: string; fullName: string; jobTitle: string | null; status: string | null };

const statusLabels: Record<(typeof attendanceStatuses)[number], string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  leave: "On leave",
};

export function AttendanceForm({ date, workers }: { date: string; workers: AttendanceRow[] }) {
  const [state, action, pending] = useActionState(saveAttendance, {} as WorkerState);
  return <form action={action} className="rounded-xl border border-border bg-card">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
      <div><h2 className="font-bold">Daily attendance</h2><p className="text-sm text-muted-foreground">Leave a worker as “Not recorded” to skip them. {workers.length} active worker{workers.length === 1 ? "" : "s"}.</p></div>
      <input name="date" type="hidden" value={date} />
    </div>
    {workers.length ? <div className="divide-y divide-border">
      {workers.map((worker) => <div key={worker.id} className="grid items-center gap-2 p-4 md:grid-cols-[2fr_1fr]">
        <div><p className="font-semibold">{worker.fullName}</p><p className="text-sm text-muted-foreground">{worker.jobTitle || "No job title"}</p></div>
        <label className="text-sm">
          <span className="sr-only">Attendance status for {worker.fullName}</span>
          <select name={`status_${worker.id}`} defaultValue={worker.status ?? ""} className="w-full rounded-lg border border-input bg-card px-3 py-2">
            <option value="">Not recorded</option>
            {attendanceStatuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}
          </select>
        </label>
      </div>)}
    </div> : <p className="p-5 text-sm text-muted-foreground">No active workers are registered at this site yet.</p>}
    {(state.error || state.success || workers.length > 0) && <div className="border-t border-border px-5 py-4">
      {state.error && <p role="alert" className="mb-3 rounded-lg bg-destructive/12 p-3 text-sm text-destructive">{state.error}</p>}
      {state.success && <p role="status" className="mb-3 rounded-lg bg-success/12 p-3 text-sm text-primary">{state.success}</p>}
      {workers.length > 0 && <button disabled={pending} className="rounded-lg bg-primary px-4 py-3 font-semibold text-white disabled:opacity-60">{pending ? "Saving…" : "Save attendance"}</button>}
    </div>}
  </form>;
}
