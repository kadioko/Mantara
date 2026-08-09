"use client";

import { useActionState, useRef } from "react";
import { useT } from "@/lib/i18n/client";
import { useEncryptedDraft } from "@/lib/offline/encrypted-drafts";
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
  const formRef = useRef<HTMLFormElement>(null);
  const draftStatus = useEncryptedDraft(formRef, "shift-plan", Boolean(state.success));
  return <form ref={formRef} action={action} className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-3">
    <div className="md:col-span-3"><h2 className="text-lg font-bold">{tr("planShift")}</h2><p className="mt-1 text-sm text-muted-foreground">{tr("shiftGroupingDescription")}</p></div>
    <label className="text-sm font-semibold">{tr("fShiftName")} *<input required name="name" maxLength={80} placeholder={tr("dayShiftExample")} className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fDate")} *<input required name="shiftDate" type="date" defaultValue={today} className={fieldClass} /></label>
    <OptionSelect name="supervisorWorkerId" label={tr("supervisor")} options={supervisors} placeholder={tr("optUnassigned")} />
    <label className="text-sm font-semibold">{tr("fStartsAt")}<input name="startsAt" type="time" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fEndsAt")}<input name="endsAt" type="time" className={fieldClass} /></label>
    <label className="text-sm font-semibold md:col-span-3">{tr("fNotes")}<input name="notes" maxLength={2000} className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} />{draftStatus !== "idle" && <p role="status" className="mt-2 text-xs text-muted-foreground">{tr(draftStatus === "restored" ? "offlineDraftRestored" : "offlineDraftSaved")}</p>}</div>
    <div className="md:col-span-3"><Button disabled={pending}>{pending ? "Saving…" : "Create shift"}</Button></div>
  </form>;
}

export function ProductionEntryForm({ shifts, today }: { shifts: Option[]; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(createProductionEntry, {} as ProductionState);
  return <form action={action} className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-3">
    <div className="md:col-span-3"><h2 className="text-lg font-bold">{tr("captureProduction")}</h2><p className="mt-1 text-sm text-muted-foreground">{tr("productionDraftDescription")}</p></div>
    <label className="text-sm font-semibold">{tr("fDate")} *<input required name="entryDate" type="date" defaultValue={today} className={fieldClass} /></label>
    <OptionSelect name="shiftId" label={tr("fShift")} options={shifts} placeholder={tr("optNoShift")} />
    <label className="text-sm font-semibold">{tr("fMaterial")} *<input required name="material" maxLength={120} placeholder={tr("goldOreExample")} className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fQuantity")} *<input required name="quantity" type="number" min="0" step="0.001" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fUnit")} *<input required name="unit" maxLength={20} defaultValue="tonnes" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fGradePpmLabel")}<input name="grade" type="number" min="0" step="0.0001" placeholder="3.2500" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fLocation")}<input name="location" maxLength={120} placeholder={tr("pitExample")} className={fieldClass} /></label>
    <label className="text-sm font-semibold md:col-span-2">{tr("fNotes")}<input name="notes" maxLength={2000} className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div className="md:col-span-3"><Button disabled={pending}>{pending ? "Saving…" : "Save draft"}</Button></div>
  </form>;
}

export function OreLotForm({ shifts, today }: { shifts: Option[]; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(createOreLot, {} as ProductionState);
  return <form action={action} className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-3">
    <div className="md:col-span-3"><h2 className="text-lg font-bold">{tr("baggedOreLot")}</h2><p className="mt-1 text-sm text-muted-foreground">{tr("baggedOreDescription")}</p></div>
    <label className="text-sm font-semibold">{tr("fLotNumber")} *<input required name="lotNumber" maxLength={80} placeholder="ORE-20260807-01" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fProducedOn")} *<input required name="producedOn" type="date" defaultValue={today} className={fieldClass} /></label>
    <OptionSelect name="shiftId" label={tr("fShift")} options={shifts} placeholder={tr("optNoShift")} />
    <label className="text-sm font-semibold">{tr("fOreTonnes")} *<input required name="oreTonnes" type="number" min="0.001" step="0.001" placeholder="12.500" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fGradePpmLabel")} *<input required name="gradePpm" type="number" min="0" step="0.0001" placeholder="3.2500" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fAssayMethod")}<input name="gradeMethod" maxLength={120} placeholder={tr("labAssayExample")} className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fBags")} *<input required name="bagCount" type="number" min="1" step="1" placeholder="250" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fWeightPerBagKg")} *<input required name="bagWeightKg" type="number" min="0.001" step="0.001" placeholder="50" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fSourceLocation")}<input name="sourceLocation" maxLength={120} placeholder={tr("stockpileExample")} className={fieldClass} /></label>
    <label className="text-sm font-semibold md:col-span-3">{tr("fNotes")}<input name="notes" maxLength={2000} placeholder={tr("samplingReferenceExample")} className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div className="md:col-span-3"><Button disabled={pending}>{pending ? "Savingâ€¦" : "Record bagged ore"}</Button></div>
  </form>;
}

export function OreDispatchForm({ lots, today }: { lots: Option[]; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(dispatchOreLot, {} as ProductionState);
  return <form action={action} className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-3">
    <div className="md:col-span-3"><h2 className="text-lg font-bold">{tr("dispatchToPlant")}</h2><p className="mt-1 text-sm text-muted-foreground">{tr("dispatchLimitDescription")}</p></div>
    <OptionSelect name="lotId" label={tr("baggedOreLot")} options={lots} placeholder={tr("selectLot")} />
    <label className="text-sm font-semibold">{tr("fProcessingPlant")} *<input required name="processingPlant" maxLength={160} placeholder={tr("processingPlantExample")} className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fDispatchDate")} *<input required name="dispatchedOn" type="date" defaultValue={today} className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fDispatchedTonnes")} *<input required name="dispatchedTonnes" type="number" min="0.001" step="0.001" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fDispatchedBags")} *<input required name="dispatchedBags" type="number" min="1" step="1" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fVehicleReferenceLabel")}<input name="vehicleReference" maxLength={120} placeholder={tr("vehicleExample")} className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fDispatchReference")}<input name="dispatchReference" maxLength={120} placeholder="WAYBILL-001" className={fieldClass} /></label>
    <label className="text-sm font-semibold md:col-span-2">{tr("fNotes")}<input name="notes" maxLength={2000} className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div className="md:col-span-3"><Button disabled={pending || lots.length === 0}>{pending ? tr("saving") : tr("recordDispatch")}</Button>{lots.length === 0 && <p className="mt-2 text-sm text-muted-foreground">{tr("recordLotBeforeDispatch")}</p>}</div>
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
        <option value="approved">{tr("actApprove")}</option>
        <option value="rejected">{tr("actReject")}</option>
      </select>
    </label>
    <label className="text-sm font-semibold md:col-span-2">{tr("fNotes")}<input name="notes" maxLength={500} placeholder={tr("weighbridgeCheckExample")} className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Record decision"}</Button></div>
  </form>;
}

export function DowntimeForm({ shifts, equipment }: { shifts: Option[]; equipment: Option[] }) {
  const tr = useT();
  const [state, action, pending] = useActionState(createDowntime, {} as ProductionState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <label className="text-sm font-semibold md:col-span-2">{tr("fReason")} *<input required name="reason" maxLength={200} placeholder={tr("downtimeReasonExample")} className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fMinutes")} *<input required name="minutes" type="number" min="1" step="1" className={fieldClass} /></label>
    <OptionSelect name="shiftId" label={tr("fShift")} options={shifts} placeholder={tr("optNoShift")} />
    <OptionSelect name="equipmentId" label={tr("fEquipment")} options={equipment} placeholder={tr("optNotEquipmentSpecific")} />
    <label className="text-sm font-semibold">{tr("fNotes")}<input name="notes" maxLength={2000} className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Record downtime"}</Button></div>
  </form>;
}
