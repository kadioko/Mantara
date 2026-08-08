"use client";

import { useActionState } from "react";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { fieldClass, selectClass } from "@/components/ui/form";
import {
  createFuelLocation,
  recordFuelAdjustment,
  recordFuelIssue,
  recordFuelReceipt,
  type FuelState,
} from "./actions";
import { fuelTypeLabels, fuelTypes } from "./schemas";


export type Option = { id: string; label: string };

function Feedback({ state }: { state: FuelState }) {
  if (state.error) return <p role="alert" className="rounded-lg bg-destructive/12 p-3 text-sm text-destructive">{state.error}</p>;
  if (state.success) return <p role="status" className="rounded-lg bg-success/12 p-3 text-sm text-primary">{state.success}</p>;
  return null;
}

function LocationSelect({ locations }: { locations: Option[] }) {
  return <label className="text-sm font-semibold">Fuel store *
    <select required name="locationId" defaultValue={locations[0]?.id ?? ""} className={selectClass}>
      {locations.map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}
    </select>
  </label>;
}

function OptionSelect({ name, label, options, placeholder }: { name: string; label: string; options: Option[]; placeholder: string }) {
  return <label className="text-sm font-semibold">{label}
    <select name={name} defaultValue="" className={selectClass}>
      <option value="">{placeholder}</option>
      {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
  </label>;
}

export function FuelLocationForm() {
  const tr = useT();
  const [state, action, pending] = useActionState(createFuelLocation, {} as FuelState);
  return <form action={action} className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-3">
    <div className="md:col-span-3"><h2 className="text-lg font-bold">Add a fuel store</h2><p className="mt-1 text-sm text-muted-foreground">Tanks and bowsers held at this mine site.</p></div>
    <label className="text-sm font-semibold">{tr("fName")} *<input required name="name" maxLength={120} placeholder="Main diesel tank" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fFuelType")} *<select required name="fuelType" defaultValue="diesel" className={selectClass}>{fuelTypes.map((value) => <option key={value} value={value}>{fuelTypeLabels[value]}</option>)}</select></label>
    <label className="text-sm font-semibold">Capacity (litres)<input name="capacityLitres" type="number" min="0" step="0.001" className={fieldClass} /></label>
    <label className="text-sm font-semibold md:col-span-3">{tr("fNotes")}<input name="notes" maxLength={2000} className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div className="md:col-span-3"><Button disabled={pending}>{pending ? "Saving…" : "Add fuel store"}</Button></div>
  </form>;
}

export function FuelReceiptForm({ locations, today }: { locations: Option[]; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(recordFuelReceipt, {} as FuelState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <LocationSelect locations={locations} />
    <label className="text-sm font-semibold">{tr("fLitres")} *<input required name="litres" type="number" min="0.001" step="0.001" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fReceivedOn")} *<input required name="receivedOn" type="date" defaultValue={today} className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fSupplier")}<input name="supplier" maxLength={160} className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fReference")}<input name="reference" maxLength={120} placeholder="Delivery note number" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fUnitCost")}<input name="unitCost" type="number" min="0" step="0.0001" className={fieldClass} /></label>
    <label className="text-sm font-semibold md:col-span-3">{tr("fNotes")}<input name="notes" maxLength={500} className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Record delivery"}</Button></div>
  </form>;
}

export function FuelIssueForm({ locations, equipment, workers, today }: { locations: Option[]; equipment: Option[]; workers: Option[]; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(recordFuelIssue, {} as FuelState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <LocationSelect locations={locations} />
    <label className="text-sm font-semibold">{tr("fLitres")} *<input required name="litres" type="number" min="0.001" step="0.001" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fIssuedOn")} *<input required name="issuedOn" type="date" defaultValue={today} className={fieldClass} /></label>
    <OptionSelect name="equipmentId" label={tr("fEquipment")} options={equipment} placeholder={tr("optNotEquipmentSpecific")} />
    <OptionSelect name="workerId" label="Collected by" options={workers} placeholder={tr("optNotRecorded")} />
    <label className="text-sm font-semibold">Equipment meter<input name="equipmentMeter" type="number" min="0" step="0.01" className={fieldClass} /></label>
    <label className="text-sm font-semibold md:col-span-3">{tr("fNotes")}<input name="notes" maxLength={500} className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Issue fuel"}</Button></div>
  </form>;
}

export function FuelAdjustmentForm({ locations, today }: { locations: Option[]; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(recordFuelAdjustment, {} as FuelState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <LocationSelect locations={locations} />
    <label className="text-sm font-semibold">Litres (+/−) *<input required name="litresDelta" type="number" step="0.001" placeholder="-25" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fAdjustedOn")} *<input required name="adjustedOn" type="date" defaultValue={today} className={fieldClass} /></label>
    <label className="text-sm font-semibold md:col-span-2">{tr("fReason")} *<input required name="reason" maxLength={200} placeholder="Stock take variance" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fNotes")}<input name="notes" maxLength={500} className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Record adjustment"}</Button></div>
  </form>;
}
