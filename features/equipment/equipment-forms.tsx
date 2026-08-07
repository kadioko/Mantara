"use client";

import { useActionState } from "react";
import {
  createEquipment,
  createEquipmentAssignment,
  recordMeterReading,
  updateEquipmentStatus,
  type EquipmentState,
} from "./actions";
import { categoryLabels, equipmentCategories, equipmentStatuses, meterTypes, statusLabels } from "./schemas";

const field = "mt-1 w-full rounded-lg border border-stone-300 px-3 py-2";
const submit = "rounded-lg bg-emerald-800 px-4 py-2.5 font-semibold text-white disabled:opacity-60";

function Feedback({ state }: { state: EquipmentState }) {
  if (state.error) return <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>;
  if (state.success) return <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{state.success}</p>;
  return null;
}

export function EquipmentForm() {
  const [state, action, pending] = useActionState(createEquipment, {} as EquipmentState);
  return <form action={action} className="grid gap-4 rounded-xl border border-stone-200 bg-white p-5 md:grid-cols-2">
    <div className="md:col-span-2"><h2 className="text-lg font-bold">Add equipment</h2><p className="mt-1 text-sm text-stone-600">Register an asset against the active mine site.</p></div>
    <label className="text-sm font-semibold">Name *<input required name="name" maxLength={160} placeholder="CAT 320 excavator" className={field} /></label>
    <label className="text-sm font-semibold">Asset code<input name="assetCode" maxLength={80} placeholder="EXC-001" className={field} /></label>
    <label className="text-sm font-semibold">Category *<select required name="category" defaultValue="excavator" className={`${field} bg-white`}>{equipmentCategories.map((value) => <option key={value} value={value}>{categoryLabels[value]}</option>)}</select></label>
    <label className="text-sm font-semibold">Meter type *<select required name="meterType" defaultValue="hours" className={`${field} bg-white`}>{meterTypes.map((value) => <option key={value} value={value} className="capitalize">{value}</option>)}</select></label>
    <label className="text-sm font-semibold">Make<input name="make" maxLength={100} className={field} /></label>
    <label className="text-sm font-semibold">Model<input name="model" maxLength={100} className={field} /></label>
    <label className="text-sm font-semibold">Serial number<input name="serialNumber" maxLength={120} className={field} /></label>
    <label className="text-sm font-semibold">Year of manufacture<input name="yearOfManufacture" type="number" min="1900" max="2100" step="1" className={field} /></label>
    <label className="text-sm font-semibold">Opening meter<input name="currentMeter" type="number" min="0" step="0.01" className={field} /></label>
    <label className="text-sm font-semibold">Acquired on<input name="acquiredOn" type="date" className={field} /></label>
    <label className="text-sm font-semibold md:col-span-2">Notes<textarea name="notes" maxLength={2000} rows={3} className={field} /></label>
    <div className="md:col-span-2"><Feedback state={state} /></div>
    <div className="md:col-span-2"><button disabled={pending} className={submit}>{pending ? "Saving…" : "Add equipment"}</button></div>
  </form>;
}

export function MeterReadingForm({ equipmentId, meterType, currentMeter, today }: { equipmentId: string; meterType: string; currentMeter: number | null; today: string }) {
  const [state, action, pending] = useActionState(recordMeterReading, {} as EquipmentState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <input name="equipmentId" type="hidden" value={equipmentId} />
    <label className="text-sm font-semibold">Reading ({meterType}) *
      <input required name="reading" type="number" min={currentMeter ?? 0} step="0.01" defaultValue={currentMeter ?? undefined} className={field} />
    </label>
    <label className="text-sm font-semibold">Reading date<input name="readingOn" type="date" defaultValue={today} className={field} /></label>
    <label className="text-sm font-semibold">Notes<input name="notes" maxLength={500} className={field} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><button disabled={pending} className={submit}>{pending ? "Saving…" : "Record reading"}</button></div>
  </form>;
}

export function EquipmentStatusForm({ equipmentId, status }: { equipmentId: string; status: string }) {
  const [state, action, pending] = useActionState(updateEquipmentStatus, {} as EquipmentState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <input name="equipmentId" type="hidden" value={equipmentId} />
    <label className="text-sm font-semibold">Status
      <select name="status" defaultValue={status} className={`${field} bg-white`}>{equipmentStatuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}</select>
    </label>
    <label className="text-sm font-semibold md:col-span-2">Reason<input name="reason" maxLength={500} placeholder="Hydraulic leak reported by operator" className={field} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><button disabled={pending} className={submit}>{pending ? "Saving…" : "Update status"}</button></div>
  </form>;
}

export function EquipmentAssignmentForm({ equipmentId, workers, today }: { equipmentId: string; workers: Array<{ id: string; fullName: string }>; today: string }) {
  const [state, action, pending] = useActionState(createEquipmentAssignment, {} as EquipmentState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <input name="equipmentId" type="hidden" value={equipmentId} />
    <label className="text-sm font-semibold md:col-span-2">Assignment *<input required name="assignmentName" maxLength={160} placeholder="Day shift — pit 2" className={field} /></label>
    <label className="text-sm font-semibold">Operator
      <select name="workerId" defaultValue="" className={`${field} bg-white`}>
        <option value="">Unassigned</option>
        {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.fullName}</option>)}
      </select>
    </label>
    <label className="text-sm font-semibold">Starts on *<input required name="startsOn" type="date" defaultValue={today} className={field} /></label>
    <label className="text-sm font-semibold">Ends on<input name="endsOn" type="date" className={field} /></label>
    <div className="flex items-end"><button disabled={pending} className={submit}>{pending ? "Saving…" : "Add assignment"}</button></div>
    <div className="md:col-span-3"><Feedback state={state} /></div>
  </form>;
}
