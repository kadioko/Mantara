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
    <div className="md:col-span-2"><h2 className="text-lg font-bold">{tr("uiAddEquipment")}</h2><p className="mt-1 text-sm text-muted-foreground">{tr("uiRegisterAnAssetAgainstTheActiveMineSite")}</p></div>
    <label className="text-sm font-semibold">{tr("fName")} *<input required name="name" maxLength={160} placeholder={tr("uiCAT320Excavator")} className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fAssetCode")}<input name="assetCode" maxLength={80} placeholder="EXC-001" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fCategory")} *<select required name="category" defaultValue="excavator" className={selectClass}>{equipmentCategories.map((value) => <option key={value} value={value}>{categoryLabels[value]}</option>)}</select></label>
    <label className="text-sm font-semibold">{tr("fMeterType")} *<select required name="meterType" defaultValue="hours" className={selectClass}>{meterTypes.map((value) => <option key={value} value={value} className="capitalize">{value}</option>)}</select></label>
    <label className="text-sm font-semibold">{tr("fMake")}<input name="make" maxLength={100} className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fModel")}<input name="model" maxLength={100} className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fSerialNumber")}<input name="serialNumber" maxLength={120} className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fYearOfManufacture")}<input name="yearOfManufacture" type="number" min="1900" max="2100" step="1" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("uiOpeningMeter")}<input name="currentMeter" type="number" min="0" step="0.01" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fAcquiredOn")}<input name="acquiredOn" type="date" className={fieldClass} /></label>
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
    <label className="text-sm font-semibold">{tr("uiReadingDate")}<input name="readingOn" type="date" defaultValue={today} className={fieldClass} /></label>
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
    <label className="text-sm font-semibold md:col-span-2">{tr("fReason")}<input name="reason" maxLength={500} placeholder={tr("uiHydraulicLeakReportedByOperator")} className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Update status"}</Button></div>
  </form>;
}

export function EquipmentAssignmentForm({ equipmentId, workers, today }: { equipmentId: string; workers: Array<{ id: string; fullName: string }>; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(createEquipmentAssignment, {} as EquipmentState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <input name="equipmentId" type="hidden" value={equipmentId} />
    <label className="text-sm font-semibold md:col-span-2">{tr("fAssignment")} *<input required name="assignmentName" maxLength={160} placeholder={tr("uiDayShiftPit2")} className={fieldClass} /></label>
    <label className="text-sm font-semibold">Operator
      <select name="workerId" defaultValue="" className={selectClass}>
        <option value="">{tr("optUnassigned")}</option>
        {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.fullName}</option>)}
      </select>
    </label>
    <label className="text-sm font-semibold">{tr("fStartsOn")} *<input required name="startsOn" type="date" defaultValue={today} className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fEndsOn")}<input name="endsOn" type="date" className={fieldClass} /></label>
    <div className="flex items-end"><Button disabled={pending}>{pending ? "Saving…" : "Add assignment"}</Button></div>
    <div className="md:col-span-3"><Feedback state={state} /></div>
  </form>;
}
