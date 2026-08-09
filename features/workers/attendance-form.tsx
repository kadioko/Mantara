"use client";

import { useActionState, useRef } from "react";
import { useT } from "@/lib/i18n/client";
import { useEncryptedDraft } from "@/lib/offline/encrypted-drafts";
import { saveAttendance, type WorkerState } from "./actions";
import { attendanceStatuses } from "./schemas";

export type AttendanceRow = { id:string; fullName:string; jobTitle:string|null; status:string|null };

export function AttendanceForm({date,workers}:{date:string;workers:AttendanceRow[]}){
  const tr=useT();
  const [state,action,pending]=useActionState(saveAttendance,{} as WorkerState);
  const formRef=useRef<HTMLFormElement>(null);
  const draftStatus=useEncryptedDraft(formRef,`attendance-${date}`,Boolean(state.success));
  const statusLabels={present:tr("present"),absent:tr("absent"),late:tr("late"),leave:tr("leave")};
  return <form ref={formRef} action={action} className="rounded-xl border border-border bg-card">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
      <div><h2 className="font-bold">{tr("dailyAttendanceTitle")}</h2><p className="text-sm text-muted-foreground">{tr("attendanceSkipHint",{count:String(workers.length)})}</p></div>
      <input name="date" type="hidden" value={date}/>
    </div>
    {workers.length?<div className="divide-y divide-border">{workers.map(worker=><div key={worker.id} className="grid items-center gap-2 p-4 md:grid-cols-[2fr_1fr]">
      <div><p className="font-semibold">{worker.fullName}</p><p className="text-sm text-muted-foreground">{worker.jobTitle||tr("noJobTitle")}</p></div>
      <label className="text-sm"><span className="sr-only">{tr("attendanceFor",{worker:worker.fullName})}</span><select name={`status_${worker.id}`} defaultValue={worker.status??""} className="w-full rounded-lg border border-input bg-card px-3 py-2"><option value="">{tr("optNotRecorded")}</option>{attendanceStatuses.map(value=><option key={value} value={value}>{statusLabels[value]}</option>)}</select></label>
    </div>)}</div>:<p className="p-5 text-sm text-muted-foreground">{tr("noWorkers")}</p>}
    {(state.error||state.success||workers.length>0)&&<div className="border-t border-border px-5 py-4">
      {state.error&&<p role="alert" className="mb-3 rounded-lg bg-destructive/12 p-3 text-sm text-destructive">{state.error}</p>}
      {state.success&&<p role="status" className="mb-3 rounded-lg bg-success/12 p-3 text-sm text-primary">{state.success}</p>}
      {draftStatus!=="idle"&&<p role="status" className="mb-3 text-xs text-muted-foreground">{tr(draftStatus==="restored"?"offlineDraftRestored":"offlineDraftSaved")}</p>}
      {workers.length>0&&<button disabled={pending} className="rounded-lg bg-primary px-4 py-3 font-semibold text-white disabled:opacity-60">{pending?tr("saving"):tr("saveAttendance")}</button>}
    </div>}
  </form>;
}
