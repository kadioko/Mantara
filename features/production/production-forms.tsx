"use client";

import { useActionState } from "react";
import {
  createDowntime,
  createProductionEntry,
  createShift,
  reviewProductionEntry,
  submitProductionEntry,
  type ProductionState,
} from "./actions";

const field = "mt-1 w-full rounded-lg border border-stone-300 px-3 py-2";
const submitClass = "rounded-lg bg-emerald-800 px-4 py-2.5 font-semibold text-white disabled:opacity-60";

export type Option = { id: string; label: string };

function Feedback({ state }: { state: ProductionState }) {
  if (state.error) return <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>;
  if (state.success) return <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{state.success}</p>;
  return null;
}

function OptionSelect({ name, label, options, placeholder }: { name: string; label: string; options: Option[]; placeholder: string }) {
  return <label className="text-sm font-semibold">{label}
    <select name={name} defaultValue="" className={`${field} bg-white`}>
      <option value="">{placeholder}</option>
      {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
  </label>;
}

export function ShiftForm({ supervisors, today }: { supervisors: Option[]; today: string }) {
  const [state, action, pending] = useActionState(createShift, {} as ProductionState);
  return <form action={action} className="grid gap-4 rounded-xl border border-stone-200 bg-white p-5 md:grid-cols-3">
    <div className="md:col-span-3"><h2 className="text-lg font-bold">Plan a shift</h2><p className="mt-1 text-sm text-stone-600">Shifts group production and downtime for a day.</p></div>
    <label className="text-sm font-semibold">Shift name *<input required name="name" maxLength={80} placeholder="Day shift" className={field} /></label>
    <label className="text-sm font-semibold">Date *<input required name="shiftDate" type="date" defaultValue={today} className={field} /></label>
    <OptionSelect name="supervisorWorkerId" label="Supervisor" options={supervisors} placeholder="Unassigned" />
    <label className="text-sm font-semibold">Starts at<input name="startsAt" type="time" className={field} /></label>
    <label className="text-sm font-semibold">Ends at<input name="endsAt" type="time" className={field} /></label>
    <label className="text-sm font-semibold md:col-span-3">Notes<input name="notes" maxLength={2000} className={field} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div className="md:col-span-3"><button disabled={pending} className={submitClass}>{pending ? "Saving…" : "Create shift"}</button></div>
  </form>;
}

export function ProductionEntryForm({ shifts, today }: { shifts: Option[]; today: string }) {
  const [state, action, pending] = useActionState(createProductionEntry, {} as ProductionState);
  return <form action={action} className="grid gap-4 rounded-xl border border-stone-200 bg-white p-5 md:grid-cols-3">
    <div className="md:col-span-3"><h2 className="text-lg font-bold">Capture production</h2><p className="mt-1 text-sm text-stone-600">Entries start as drafts and must be submitted for approval.</p></div>
    <label className="text-sm font-semibold">Date *<input required name="entryDate" type="date" defaultValue={today} className={field} /></label>
    <OptionSelect name="shiftId" label="Shift" options={shifts} placeholder="No shift" />
    <label className="text-sm font-semibold">Material *<input required name="material" maxLength={120} placeholder="Gold ore" className={field} /></label>
    <label className="text-sm font-semibold">Quantity *<input required name="quantity" type="number" min="0" step="0.001" className={field} /></label>
    <label className="text-sm font-semibold">Unit *<input required name="unit" maxLength={20} defaultValue="tonnes" className={field} /></label>
    <label className="text-sm font-semibold">Grade<input name="grade" type="number" min="0" step="0.0001" placeholder="g/t" className={field} /></label>
    <label className="text-sm font-semibold">Location<input name="location" maxLength={120} placeholder="Pit 2" className={field} /></label>
    <label className="text-sm font-semibold md:col-span-2">Notes<input name="notes" maxLength={2000} className={field} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div className="md:col-span-3"><button disabled={pending} className={submitClass}>{pending ? "Saving…" : "Save draft"}</button></div>
  </form>;
}

export function SubmitEntryForm({ entryId }: { entryId: string }) {
  const [state, action, pending] = useActionState(submitProductionEntry, {} as ProductionState);
  return <form action={action} className="space-y-3">
    <input name="entryId" type="hidden" value={entryId} />
    <Feedback state={state} />
    <button disabled={pending} className={submitClass}>{pending ? "Submitting…" : "Submit for approval"}</button>
  </form>;
}

export function ReviewForm({ entryId }: { entryId: string }) {
  const [state, action, pending] = useActionState(reviewProductionEntry, {} as ProductionState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <input name="entryId" type="hidden" value={entryId} />
    <label className="text-sm font-semibold">Decision *
      <select name="decision" defaultValue="approved" className={`${field} bg-white`}>
        <option value="approved">Approve</option>
        <option value="rejected">Reject</option>
      </select>
    </label>
    <label className="text-sm font-semibold md:col-span-2">Notes<input name="notes" maxLength={500} placeholder="Checked against weighbridge ticket" className={field} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><button disabled={pending} className={submitClass}>{pending ? "Saving…" : "Record decision"}</button></div>
  </form>;
}

export function DowntimeForm({ shifts, equipment }: { shifts: Option[]; equipment: Option[] }) {
  const [state, action, pending] = useActionState(createDowntime, {} as ProductionState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <label className="text-sm font-semibold md:col-span-2">Reason *<input required name="reason" maxLength={200} placeholder="Conveyor belt failure" className={field} /></label>
    <label className="text-sm font-semibold">Minutes *<input required name="minutes" type="number" min="1" step="1" className={field} /></label>
    <OptionSelect name="shiftId" label="Shift" options={shifts} placeholder="No shift" />
    <OptionSelect name="equipmentId" label="Equipment" options={equipment} placeholder="Not equipment specific" />
    <label className="text-sm font-semibold">Notes<input name="notes" maxLength={2000} className={field} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><button disabled={pending} className={submitClass}>{pending ? "Saving…" : "Record downtime"}</button></div>
  </form>;
}
