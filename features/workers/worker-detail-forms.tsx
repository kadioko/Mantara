"use client";

import { useActionState } from "react";
import { createAssignment, createTraining, issuePpe, updateWorkerStatus, type WorkerState } from "./actions";
import { workerStatuses } from "./schemas";

const field = "mt-1 w-full rounded-lg border border-stone-300 px-3 py-2";
const submit = "rounded-lg bg-emerald-800 px-4 py-2.5 font-semibold text-white disabled:opacity-60";

function Feedback({ state }: { state: WorkerState }) {
  if (state.error) return <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>;
  if (state.success) return <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{state.success}</p>;
  return null;
}

export function WorkerStatusForm({ workerId, status }: { workerId: string; status: string }) {
  const [state, action, pending] = useActionState(updateWorkerStatus, {} as WorkerState);
  return <form action={action} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
    <input name="workerId" type="hidden" value={workerId} />
    <label className="text-sm font-semibold">Employment status
      <select name="status" defaultValue={status} className={`${field} bg-white`}>
        {workerStatuses.map((value) => <option key={value} value={value} className="capitalize">{value}</option>)}
      </select>
    </label>
    <button disabled={pending} className={submit}>{pending ? "Saving…" : "Update status"}</button>
    <div className="sm:col-span-2"><Feedback state={state} /></div>
  </form>;
}

export function AssignmentForm({ workerId, today }: { workerId: string; today: string }) {
  const [state, action, pending] = useActionState(createAssignment, {} as WorkerState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <input name="workerId" type="hidden" value={workerId} />
    <label className="text-sm font-semibold md:col-span-3">Assignment *<input required name="assignmentName" maxLength={160} placeholder="Night shift — pit 2" className={field} /></label>
    <label className="text-sm font-semibold">Starts on *<input required name="startsOn" type="date" defaultValue={today} className={field} /></label>
    <label className="text-sm font-semibold">Ends on<input name="endsOn" type="date" className={field} /></label>
    <div className="flex items-end"><button disabled={pending} className={submit}>{pending ? "Saving…" : "Add assignment"}</button></div>
    <div className="md:col-span-3"><Feedback state={state} /></div>
  </form>;
}

export function TrainingForm({ workerId, today }: { workerId: string; today: string }) {
  const [state, action, pending] = useActionState(createTraining, {} as WorkerState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <input name="workerId" type="hidden" value={workerId} />
    <label className="text-sm font-semibold md:col-span-3">Training *<input required name="trainingName" maxLength={160} placeholder="Underground safety induction" className={field} /></label>
    <label className="text-sm font-semibold">Completed on *<input required name="completedOn" type="date" defaultValue={today} className={field} /></label>
    <label className="text-sm font-semibold">Expires on<input name="expiresOn" type="date" className={field} /></label>
    <div className="flex items-end"><button disabled={pending} className={submit}>{pending ? "Saving…" : "Add training"}</button></div>
    <div className="md:col-span-3"><Feedback state={state} /></div>
  </form>;
}

export function PpeForm({ workerId, today }: { workerId: string; today: string }) {
  const [state, action, pending] = useActionState(issuePpe, {} as WorkerState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <input name="workerId" type="hidden" value={workerId} />
    <label className="text-sm font-semibold md:col-span-2">Item *<input required name="itemName" maxLength={160} placeholder="Safety boots" className={field} /></label>
    <label className="text-sm font-semibold">Quantity *<input required name="quantity" type="number" min="0.001" step="0.001" defaultValue="1" className={field} /></label>
    <label className="text-sm font-semibold">Issued on *<input required name="issuedOn" type="date" defaultValue={today} className={field} /></label>
    <label className="text-sm font-semibold md:col-span-2">Notes<input name="notes" maxLength={2000} className={field} /></label>
    <div><button disabled={pending} className={submit}>{pending ? "Saving…" : "Record issue"}</button></div>
    <div className="md:col-span-3"><Feedback state={state} /></div>
  </form>;
}
