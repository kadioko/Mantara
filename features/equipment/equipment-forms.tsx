"use client";

import { useActionState } from "react";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { fieldClass, selectClass } from "@/components/ui/form";
import {
  createEquipment,
  createEquipmentAssignment,
  recordMeterReading,
  updateEquipmentStatus,
  type EquipmentState,
} from "./actions";
import { categoryLabels, equipmentCategories, equipmentStatuses, meterTypes, statusLabels } from "./schemas";


function Feedback({ state }: { state: EquipmentState }) {
  if (state.error) return <p role="alert" className="rounded-lg bg-destructive/12 p-3 text-sm text-destructive">{state.error}</p>;
  if (state.success) return <p role="status" className="rounded-lg bg-success/12 p-3 text-sm text-primary">{state.success}</p>;
  return null;
}

export function EquipmentForm() {
  const tr = useT();
  const [state, action, pending] = useActionState(createEquipment, {} as EquipmentState);
  return <form action={action} className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-2">
    <div className="md:col-span-2"><h2 className="text-lg font-bold">Add equipment</h2><p className="mt-1 text-sm text-muted-foreground">Register an asset against the active mine site.</p></div>
    <label className="text-sm font-semibold">{tr("fName")} *<input required name="name" maxLength={160} placeholder="CAT 320 excavator" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Asset code<input name="assetCode" maxLength={80} placeholder="EXC-001" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fCategory")} *<select required name="category" defaultValue="excavator" className={selectClass}>{equipmentCategories.map((value) => <option key={value} value={value}>{categoryLabels[value]}</option>)}</select></label>
    <label className="text-sm font-semibold">Meter type *<select required name="meterType" defaultValue="hours" className={selectClass}>{meterTypes.map((value) => <option key={value} value={value} className="capitalize">{value}</option>)}</select></label>
    <label className="text-sm font-semibold">Make<input name="make" maxLength={100} className={fieldClass} /></label>
    <label className="text-sm font-semibold">Model<input name="model" maxLength={100} className={fieldClass} /></label>
    <label className="text-sm font-semibold">Serial number<input name="serialNumber" maxLength={120} className={fieldClass} /></label>
    <label className="text-sm font-semibold">Year of manufacture<input name="yearOfManufacture" type="number" min="1900" max="2100" step="1" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Opening meter<input name="currentMeter" type="number" min="0" step="0.01" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Acquired on<input name="acquiredOn" type="date" className={fieldClass} /></label>
    <label className="text-sm font-semibold md:col-span-2">{tr("fNotes")}<textarea name="notes" maxLength={2000} rows={3} className={fieldClass} /></label>
    <div className="md:col-span-2"><Feedback state={state} /></div>
    <div className="md:col-span-2"><Button disabled={pending}>{pending ? "Saving…" : "Add equipment"}</Button></div>
  </form>;
}

export function MeterReadingForm({ equipmentId, meterType, currentMeter, today }: { equipmentId: string; meterType: string; currentMeter: number | null; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(recordMeterReading, {} as EquipmentState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <input name="equipmentId" type="hidden" value={equipmentId} />
    <label className="text-sm font-semibold">Reading ({meterType}) *
      <input required name="reading" type="number" min={currentMeter ?? 0} step="0.01" defaultValue={currentMeter ?? undefined} className={fieldClass} />
    </label>
    <label className="text-sm font-semibold">Reading date<input name="readingOn" type="date" defaultValue={today} className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fNotes")}<input name="notes" maxLength={500} className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Record reading"}</Button></div>
  </form>;
}

export function EquipmentStatusForm({ equipmentId, status }: { equipmentId: string; status: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(updateEquipmentStatus, {} as EquipmentState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <input name="equipmentId" type="hidden" value={equipmentId} />
    <label className="text-sm font-semibold">Status
      <select name="status" defaultValue={status} className={selectClass}>{equipmentStatuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}</select>
    </label>
    <label className="text-sm font-semibold md:col-span-2">{tr("fReason")}<input name="reason" maxLength={500} placeholder="Hydraulic leak reported by operator" className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Update status"}</Button></div>
  </form>;
}

export function EquipmentAssignmentForm({ equipmentId, workers, today }: { equipmentId: string; workers: Array<{ id: string; fullName: string }>; today: string }) {
  const [state, action, pending] = useActionState(createEquipmentAssignment, {} as EquipmentState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <input name="equipmentId" type="hidden" value={equipmentId} />
    <label className="text-sm font-semibold md:col-span-2">Assignment *<input required name="assignmentName" maxLength={160} placeholder="Day shift — pit 2" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Operator
      <select name="workerId" defaultValue="" className={selectClass}>
        <option value="">Unassigned</option>
        {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.fullName}</option>)}
      </select>
    </label>
    <label className="text-sm font-semibold">Starts on *<input required name="startsOn" type="date" defaultValue={today} className={fieldClass} /></label>
    <label className="text-sm font-semibold">Ends on<input name="endsOn" type="date" className={fieldClass} /></label>
    <div className="flex items-end"><Button disabled={pending}>{pending ? "Saving…" : "Add assignment"}</Button></div>
    <div className="md:col-span-3"><Feedback state={state} /></div>
  </form>;
}
