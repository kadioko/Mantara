"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { selectClass } from "@/components/ui/form";
import { Pencil, Trash2 } from "lucide-react";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ActionFeedback, Alert } from "@/components/ui/feedback";
import { removeEquipment, updateEquipment, type EquipmentState } from "./actions";
import { categoryLabels, equipmentCategories, meterTypes } from "./schemas";

export type EquipmentDetails = {
  id: string;
  name: string;
  asset_code: string | null;
  category: string;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  year_of_manufacture: number | null;
  meter_type: string;
  acquired_on: string | null;
  notes: string | null;
};


export function EditEquipmentForm({ equipment }: { equipment: EquipmentDetails }) {
  const [state, action, pending] = useActionState(updateEquipment, {} as EquipmentState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Pencil aria-hidden />Edit details</Button>;
  }

  return <form action={action} className="grid gap-4 md:grid-cols-2">
    <input name="equipmentId" type="hidden" value={equipment.id} />
    <div><Label htmlFor="name">Name *</Label><Input id="name" name="name" required maxLength={160} defaultValue={equipment.name} className="mt-1" /></div>
    <div><Label htmlFor="assetCode">Asset code</Label><Input id="assetCode" name="assetCode" maxLength={80} defaultValue={equipment.asset_code ?? ""} className="mt-1" /></div>
    <div>
      <Label htmlFor="category">Category *</Label>
      <select id="category" name="category" required defaultValue={equipment.category} className={selectClass}>
        {equipmentCategories.map((value) => <option key={value} value={value}>{categoryLabels[value]}</option>)}
      </select>
    </div>
    <div>
      <Label htmlFor="meterType">Meter type *</Label>
      <select id="meterType" name="meterType" required defaultValue={equipment.meter_type} className={selectClass}>
        {meterTypes.map((value) => <option key={value} value={value} className="capitalize">{value}</option>)}
      </select>
    </div>
    <div><Label htmlFor="make">Make</Label><Input id="make" name="make" maxLength={100} defaultValue={equipment.make ?? ""} className="mt-1" /></div>
    <div><Label htmlFor="model">Model</Label><Input id="model" name="model" maxLength={100} defaultValue={equipment.model ?? ""} className="mt-1" /></div>
    <div><Label htmlFor="serialNumber">Serial number</Label><Input id="serialNumber" name="serialNumber" maxLength={120} defaultValue={equipment.serial_number ?? ""} className="mt-1" /></div>
    <div><Label htmlFor="yearOfManufacture">Year of manufacture</Label><Input id="yearOfManufacture" name="yearOfManufacture" type="number" min="1900" max="2100" step="1" defaultValue={equipment.year_of_manufacture ?? ""} className="mt-1" /></div>
    <div><Label htmlFor="acquiredOn">Acquired on</Label><Input id="acquiredOn" name="acquiredOn" type="date" defaultValue={equipment.acquired_on ?? ""} className="mt-1" /></div>
    <div className="md:col-span-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" name="notes" maxLength={2000} rows={2} defaultValue={equipment.notes ?? ""} className="mt-1" /></div>
    <p className="text-xs text-muted-foreground md:col-span-2">
      The meter is not editable here. It only moves by recording a reading, which keeps it consistent with its history.
    </p>
    <div className="md:col-span-2"><ActionFeedback state={state} /></div>
    <div className="flex gap-2 md:col-span-2">
      <Button disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </div>
  </form>;
}

export function RemoveEquipmentForm({ equipmentId, equipmentName }: { equipmentId: string; equipmentName: string }) {
  const [state, action, pending] = useActionState(removeEquipment, {} as EquipmentState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => setOpen(true)}>
      <Trash2 aria-hidden />Remove from register
    </Button>;
  }

  return <form action={action} className="space-y-3">
    <input name="equipmentId" type="hidden" value={equipmentId} />
    <Alert variant="warning">
      Removing takes this asset off the register. Its meter readings, status history, and fuel issues are kept.
      If it is only out of service, change its status instead.
    </Alert>
    <div>
      <Label htmlFor="confirmName">Type <span className="font-semibold">{equipmentName}</span> to confirm</Label>
      <Input id="confirmName" name="confirmName" required autoComplete="off" className="mt-1 max-w-sm" />
    </div>
    <ActionFeedback state={state} />
    <div className="flex gap-2">
      <Button disabled={pending} variant="destructive">{pending ? "Removing…" : "Remove equipment"}</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </div>
  </form>;
}
