"use client";

import { useActionState } from "react";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { fieldClass, selectClass } from "@/components/ui/form";
import { createAssignment, createTraining, issuePpe, updateWorkerStatus, type WorkerState } from "./actions";
import { workerStatuses } from "./schemas";


function Feedback({ state }: { state: WorkerState }) {
  if (state.error) return <p role="alert" className="rounded-lg bg-destructive/12 p-3 text-sm text-destructive">{state.error}</p>;
  if (state.success) return <p role="status" className="rounded-lg bg-success/12 p-3 text-sm text-primary">{state.success}</p>;
  return null;
}

export function WorkerStatusForm({ workerId, status }: { workerId: string; status: string }) {
  const [state, action, pending] = useActionState(updateWorkerStatus, {} as WorkerState);
  return <form action={action} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
    <input name="workerId" type="hidden" value={workerId} />
    <label className="text-sm font-semibold">Employment status
      <select name="status" defaultValue={status} className={selectClass}>
        {workerStatuses.map((value) => <option key={value} value={value} className="capitalize">{value}</option>)}
      </select>
    </label>
    <Button disabled={pending}>{pending ? "Saving…" : "Update status"}</Button>
    <div className="sm:col-span-2"><Feedback state={state} /></div>
  </form>;
}

export function AssignmentForm({ workerId, today }: { workerId: string; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(createAssignment, {} as WorkerState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <input name="workerId" type="hidden" value={workerId} />
    <label className="text-sm font-semibold md:col-span-3">{tr("fAssignment")} *<input required name="assignmentName" maxLength={160} placeholder="Night shift — pit 2" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fStartsOn")} *<input required name="startsOn" type="date" defaultValue={today} className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fEndsOn")}<input name="endsOn" type="date" className={fieldClass} /></label>
    <div className="flex items-end"><Button disabled={pending}>{pending ? "Saving…" : "Add assignment"}</Button></div>
    <div className="md:col-span-3"><Feedback state={state} /></div>
  </form>;
}

export function TrainingForm({ workerId, today }: { workerId: string; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(createTraining, {} as WorkerState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <input name="workerId" type="hidden" value={workerId} />
    <label className="text-sm font-semibold md:col-span-3">Training *<input required name="trainingName" maxLength={160} placeholder="Underground safety induction" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fCompletedOn")} *<input required name="completedOn" type="date" defaultValue={today} className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fExpiresOn")}<input name="expiresOn" type="date" className={fieldClass} /></label>
    <div className="flex items-end"><Button disabled={pending}>{pending ? "Saving…" : "Add training"}</Button></div>
    <div className="md:col-span-3"><Feedback state={state} /></div>
  </form>;
}

export function PpeForm({ workerId, today }: { workerId: string; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(issuePpe, {} as WorkerState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <input name="workerId" type="hidden" value={workerId} />
    <label className="text-sm font-semibold md:col-span-2">{tr("fItem")} *<input required name="itemName" maxLength={160} placeholder="Safety boots" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fQuantity")} *<input required name="quantity" type="number" min="0.001" step="0.001" defaultValue="1" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fIssuedOn")} *<input required name="issuedOn" type="date" defaultValue={today} className={fieldClass} /></label>
    <label className="text-sm font-semibold md:col-span-2">{tr("fNotes")}<input name="notes" maxLength={2000} className={fieldClass} /></label>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Record issue"}</Button></div>
    <div className="md:col-span-3"><Feedback state={state} /></div>
  </form>;
}
