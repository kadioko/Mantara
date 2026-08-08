"use client";

import { useActionState } from "react";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { fieldClass, selectClass } from "@/components/ui/form";
import {
  createDowntime,
  createOreLot,
  createProductionEntry,
  dispatchOreLot,
  createShift,
  reviewProductionEntry,
  submitProductionEntry,
  type ProductionState,
} from "./actions";


export type Option = { id: string; label: string };

function Feedback({ state }: { state: ProductionState }) {
  if (state.error) return <p role="alert" className="rounded-lg bg-destructive/12 p-3 text-sm text-destructive">{state.error}</p>;
  if (state.success) return <p role="status" className="rounded-lg bg-success/12 p-3 text-sm text-primary">{state.success}</p>;
  return null;
}

function OptionSelect({ name, label, options, placeholder }: { name: string; label: string; options: Option[]; placeholder: string }) {
  return <label className="text-sm font-semibold">{label}
    <select name={name} defaultValue="" className={selectClass}>
      <option value="">{placeholder}</option>
      {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
  </label>;
}

export function ShiftForm({ supervisors, today }: { supervisors: Option[]; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(createShift, {} as ProductionState);
  return <form action={action} className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-3">
    <div className="md:col-span-3"><h2 className="text-lg font-bold">Plan a shift</h2><p className="mt-1 text-sm text-muted-foreground">Shifts group production and downtime for a day.</p></div>
    <label className="text-sm font-semibold">Shift name *<input required name="name" maxLength={80} placeholder="Day shift" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fDate")} *<input required name="shiftDate" type="date" defaultValue={today} className={fieldClass} /></label>
    <OptionSelect name="supervisorWorkerId" label="Supervisor" options={supervisors} placeholder={tr("optUnassigned")} />
    <label className="text-sm font-semibold">Starts at<input name="startsAt" type="time" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Ends at<input name="endsAt" type="time" className={fieldClass} /></label>
    <label className="text-sm font-semibold md:col-span-3">{tr("fNotes")}<input name="notes" maxLength={2000} className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div className="md:col-span-3"><Button disabled={pending}>{pending ? "Saving…" : "Create shift"}</Button></div>
  </form>;
}

export function ProductionEntryForm({ shifts, today }: { shifts: Option[]; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(createProductionEntry, {} as ProductionState);
  return <form action={action} className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-3">
    <div className="md:col-span-3"><h2 className="text-lg font-bold">Capture production</h2><p className="mt-1 text-sm text-muted-foreground">Entries start as drafts and must be submitted for approval.</p></div>
    <label className="text-sm font-semibold">{tr("fDate")} *<input required name="entryDate" type="date" defaultValue={today} className={fieldClass} /></label>
    <OptionSelect name="shiftId" label={tr("fShift")} options={shifts} placeholder={tr("optNoShift")} />
    <label className="text-sm font-semibold">{tr("fMaterial")} *<input required name="material" maxLength={120} placeholder="Gold ore" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fQuantity")} *<input required name="quantity" type="number" min="0" step="0.001" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fUnit")} *<input required name="unit" maxLength={20} defaultValue="tonnes" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Grade (PPM)<input name="grade" type="number" min="0" step="0.0001" placeholder="3.2500" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fLocation")}<input name="location" maxLength={120} placeholder="Pit 2" className={fieldClass} /></label>
    <label className="text-sm font-semibold md:col-span-2">{tr("fNotes")}<input name="notes" maxLength={2000} className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div className="md:col-span-3"><Button disabled={pending}>{pending ? "Saving…" : "Save draft"}</Button></div>
  </form>;
}

export function OreLotForm({ shifts, today }: { shifts: Option[]; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(createOreLot, {} as ProductionState);
  return <form action={action} className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-3">
    <div className="md:col-span-3"><h2 className="text-lg font-bold">Bagged ore lot</h2><p className="mt-1 text-sm text-muted-foreground">Record the ore as it leaves the mine area. PPM is the assay grade; for gold, 1 PPM is approximately 1 g/t.</p></div>
    <label className="text-sm font-semibold">Lot number *<input required name="lotNumber" maxLength={80} placeholder="ORE-20260807-01" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Produced on *<input required name="producedOn" type="date" defaultValue={today} className={fieldClass} /></label>
    <OptionSelect name="shiftId" label={tr("fShift")} options={shifts} placeholder={tr("optNoShift")} />
    <label className="text-sm font-semibold">Ore tonnes *<input required name="oreTonnes" type="number" min="0.001" step="0.001" placeholder="12.500" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Grade (PPM) *<input required name="gradePpm" type="number" min="0" step="0.0001" placeholder="3.2500" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Assay / grade method<input name="gradeMethod" maxLength={120} placeholder="Lab assay" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Bags *<input required name="bagCount" type="number" min="1" step="1" placeholder="250" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Weight per bag (kg) *<input required name="bagWeightKg" type="number" min="0.001" step="0.001" placeholder="50" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Source location<input name="sourceLocation" maxLength={120} placeholder="Pit 2 stockpile" className={fieldClass} /></label>
    <label className="text-sm font-semibold md:col-span-3">{tr("fNotes")}<input name="notes" maxLength={2000} placeholder="Sampling ticket or bag seal range" className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div className="md:col-span-3"><Button disabled={pending}>{pending ? "Savingâ€¦" : "Record bagged ore"}</Button></div>
  </form>;
}

export function OreDispatchForm({ lots, today }: { lots: Option[]; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(dispatchOreLot, {} as ProductionState);
  return <form action={action} className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-3">
    <div className="md:col-span-3"><h2 className="text-lg font-bold">Dispatch to processing plant</h2><p className="mt-1 text-sm text-muted-foreground">A dispatch cannot exceed the tonnes or bags recorded for its ore lot.</p></div>
    <OptionSelect name="lotId" label="Bagged ore lot" options={lots} placeholder="Select a lot" />
    <label className="text-sm font-semibold">Processing plant *<input required name="processingPlant" maxLength={160} placeholder="Kahama Processing Plant" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Dispatch date *<input required name="dispatchedOn" type="date" defaultValue={today} className={fieldClass} /></label>
    <label className="text-sm font-semibold">Dispatched tonnes *<input required name="dispatchedTonnes" type="number" min="0.001" step="0.001" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Dispatched bags *<input required name="dispatchedBags" type="number" min="1" step="1" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Vehicle / truck reference<input name="vehicleReference" maxLength={120} placeholder="T 123 ABC" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Dispatch reference<input name="dispatchReference" maxLength={120} placeholder="WAYBILL-001" className={fieldClass} /></label>
    <label className="text-sm font-semibold md:col-span-2">{tr("fNotes")}<input name="notes" maxLength={2000} className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div className="md:col-span-3"><Button disabled={pending || lots.length === 0}>{pending ? "Savingâ€¦" : "Record dispatch"}</Button>{lots.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Record a bagged ore lot before dispatching it.</p>}</div>
  </form>;
}

export function SubmitEntryForm({ entryId }: { entryId: string }) {
  const [state, action, pending] = useActionState(submitProductionEntry, {} as ProductionState);
  return <form action={action} className="space-y-3">
    <input name="entryId" type="hidden" value={entryId} />
    <Feedback state={state} />
    <Button disabled={pending}>{pending ? "Submitting…" : "Submit for approval"}</Button>
  </form>;
}

export function ReviewForm({ entryId }: { entryId: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(reviewProductionEntry, {} as ProductionState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <input name="entryId" type="hidden" value={entryId} />
    <label className="text-sm font-semibold">Decision *
      <select name="decision" defaultValue="approved" className={selectClass}>
        <option value="approved">Approve</option>
        <option value="rejected">Reject</option>
      </select>
    </label>
    <label className="text-sm font-semibold md:col-span-2">{tr("fNotes")}<input name="notes" maxLength={500} placeholder="Checked against weighbridge ticket" className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Record decision"}</Button></div>
  </form>;
}

export function DowntimeForm({ shifts, equipment }: { shifts: Option[]; equipment: Option[] }) {
  const tr = useT();
  const [state, action, pending] = useActionState(createDowntime, {} as ProductionState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <label className="text-sm font-semibold md:col-span-2">{tr("fReason")} *<input required name="reason" maxLength={200} placeholder="Conveyor belt failure" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Minutes *<input required name="minutes" type="number" min="1" step="1" className={fieldClass} /></label>
    <OptionSelect name="shiftId" label={tr("fShift")} options={shifts} placeholder={tr("optNoShift")} />
    <OptionSelect name="equipmentId" label={tr("fEquipment")} options={equipment} placeholder={tr("optNotEquipmentSpecific")} />
    <label className="text-sm font-semibold">{tr("fNotes")}<input name="notes" maxLength={2000} className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Record downtime"}</Button></div>
  </form>;
}
