"use client";

import { useActionState } from "react";
import {
  createFuelLocation,
  recordFuelAdjustment,
  recordFuelIssue,
  recordFuelReceipt,
  type FuelState,
} from "./actions";
import { fuelTypeLabels, fuelTypes } from "./schemas";

const field = "mt-1 w-full rounded-lg border border-stone-300 px-3 py-2";
const submitClass = "rounded-lg bg-emerald-800 px-4 py-2.5 font-semibold text-white disabled:opacity-60";

export type Option = { id: string; label: string };

function Feedback({ state }: { state: FuelState }) {
  if (state.error) return <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>;
  if (state.success) return <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{state.success}</p>;
  return null;
}

function LocationSelect({ locations }: { locations: Option[] }) {
  return <label className="text-sm font-semibold">Fuel store *
    <select required name="locationId" defaultValue={locations[0]?.id ?? ""} className={`${field} bg-white`}>
      {locations.map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}
    </select>
  </label>;
}

function OptionSelect({ name, label, options, placeholder }: { name: string; label: string; options: Option[]; placeholder: string }) {
  return <label className="text-sm font-semibold">{label}
    <select name={name} defaultValue="" className={`${field} bg-white`}>
      <option value="">{placeholder}</option>
      {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
  </label>;
}

export function FuelLocationForm() {
  const [state, action, pending] = useActionState(createFuelLocation, {} as FuelState);
  return <form action={action} className="grid gap-4 rounded-xl border border-stone-200 bg-white p-5 md:grid-cols-3">
    <div className="md:col-span-3"><h2 className="text-lg font-bold">Add a fuel store</h2><p className="mt-1 text-sm text-stone-600">Tanks and bowsers held at this mine site.</p></div>
    <label className="text-sm font-semibold">Name *<input required name="name" maxLength={120} placeholder="Main diesel tank" className={field} /></label>
    <label className="text-sm font-semibold">Fuel type *<select required name="fuelType" defaultValue="diesel" className={`${field} bg-white`}>{fuelTypes.map((value) => <option key={value} value={value}>{fuelTypeLabels[value]}</option>)}</select></label>
    <label className="text-sm font-semibold">Capacity (litres)<input name="capacityLitres" type="number" min="0" step="0.001" className={field} /></label>
    <label className="text-sm font-semibold md:col-span-3">Notes<input name="notes" maxLength={2000} className={field} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div className="md:col-span-3"><button disabled={pending} className={submitClass}>{pending ? "Saving…" : "Add fuel store"}</button></div>
  </form>;
}

export function FuelReceiptForm({ locations, today }: { locations: Option[]; today: string }) {
  const [state, action, pending] = useActionState(recordFuelReceipt, {} as FuelState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <LocationSelect locations={locations} />
    <label className="text-sm font-semibold">Litres *<input required name="litres" type="number" min="0.001" step="0.001" className={field} /></label>
    <label className="text-sm font-semibold">Received on *<input required name="receivedOn" type="date" defaultValue={today} className={field} /></label>
    <label className="text-sm font-semibold">Supplier<input name="supplier" maxLength={160} className={field} /></label>
    <label className="text-sm font-semibold">Reference<input name="reference" maxLength={120} placeholder="Delivery note number" className={field} /></label>
    <label className="text-sm font-semibold">Unit cost<input name="unitCost" type="number" min="0" step="0.0001" className={field} /></label>
    <label className="text-sm font-semibold md:col-span-3">Notes<input name="notes" maxLength={500} className={field} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><button disabled={pending} className={submitClass}>{pending ? "Saving…" : "Record delivery"}</button></div>
  </form>;
}

export function FuelIssueForm({ locations, equipment, workers, today }: { locations: Option[]; equipment: Option[]; workers: Option[]; today: string }) {
  const [state, action, pending] = useActionState(recordFuelIssue, {} as FuelState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <LocationSelect locations={locations} />
    <label className="text-sm font-semibold">Litres *<input required name="litres" type="number" min="0.001" step="0.001" className={field} /></label>
    <label className="text-sm font-semibold">Issued on *<input required name="issuedOn" type="date" defaultValue={today} className={field} /></label>
    <OptionSelect name="equipmentId" label="Equipment" options={equipment} placeholder="Not equipment specific" />
    <OptionSelect name="workerId" label="Collected by" options={workers} placeholder="Not recorded" />
    <label className="text-sm font-semibold">Equipment meter<input name="equipmentMeter" type="number" min="0" step="0.01" className={field} /></label>
    <label className="text-sm font-semibold md:col-span-3">Notes<input name="notes" maxLength={500} className={field} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><button disabled={pending} className={submitClass}>{pending ? "Saving…" : "Issue fuel"}</button></div>
  </form>;
}

export function FuelAdjustmentForm({ locations, today }: { locations: Option[]; today: string }) {
  const [state, action, pending] = useActionState(recordFuelAdjustment, {} as FuelState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <LocationSelect locations={locations} />
    <label className="text-sm font-semibold">Litres (+/−) *<input required name="litresDelta" type="number" step="0.001" placeholder="-25" className={field} /></label>
    <label className="text-sm font-semibold">Adjusted on *<input required name="adjustedOn" type="date" defaultValue={today} className={field} /></label>
    <label className="text-sm font-semibold md:col-span-2">Reason *<input required name="reason" maxLength={200} placeholder="Stock take variance" className={field} /></label>
    <label className="text-sm font-semibold">Notes<input name="notes" maxLength={500} className={field} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><button disabled={pending} className={submitClass}>{pending ? "Saving…" : "Record adjustment"}</button></div>
  </form>;
}
