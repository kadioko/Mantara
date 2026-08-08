"use client";

import { useActionState } from "react";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { fieldClass, selectClass } from "@/components/ui/form";
import {
  createInventoryCategory,
  createInventoryItem,
  createInventoryLocation,
  createSupplier,
  recordStockAdjustment,
  recordStockIssue,
  recordStockReceipt,
  recordStockTransfer,
  type InventoryState,
} from "./actions";
import { adjustmentReasons, issueReasons, reasonLabels } from "./schemas";


export type Option = { id: string; label: string };

function Feedback({ state }: { state: InventoryState }) {
  if (state.error) return <p role="alert" className="rounded-lg bg-destructive/12 p-3 text-sm text-destructive">{state.error}</p>;
  if (state.success) return <p role="status" className="rounded-lg bg-success/12 p-3 text-sm text-primary">{state.success}</p>;
  return null;
}

function Select({ name, label, options, placeholder, required, defaultValue }: { name: string; label: string; options: Option[]; placeholder?: string; required?: boolean; defaultValue?: string }) {
  return <label className="text-sm font-semibold">{label}{required ? " *" : ""}
    <select required={required} name={name} defaultValue={defaultValue ?? ""} className={selectClass}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
  </label>;
}

export function InventoryItemForm({ categories }: { categories: Option[] }) {
  const tr = useT();
  const [state, action, pending] = useActionState(createInventoryItem, {} as InventoryState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <label className="text-sm font-semibold md:col-span-2">{tr("fItem")} *<input required name="name" maxLength={160} placeholder="Hydraulic hose 3/4in" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fSku")}<input name="sku" maxLength={80} className={fieldClass} /></label>
    <Select name="categoryId" label={tr("fCategory")} options={categories} placeholder={tr("optUncategorised")} />
    <label className="text-sm font-semibold">{tr("fUnit")} *<input required name="unit" maxLength={20} defaultValue="each" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fReorderLevel")}<input name="reorderLevel" type="number" min="0" step="0.001" className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Add item"}</Button></div>
  </form>;
}

export function InventoryCategoryForm() {
  const tr = useT();
  const [state, action, pending] = useActionState(createInventoryCategory, {} as InventoryState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <label className="text-sm font-semibold md:col-span-2">{tr("fCategory")} *<input required name="name" maxLength={120} placeholder="Consumables" className={fieldClass} /></label>
    <div className="flex items-end"><Button disabled={pending}>{pending ? "Saving…" : "Add category"}</Button></div>
    <div className="md:col-span-3"><Feedback state={state} /></div>
  </form>;
}

export function InventoryLocationForm() {
  const tr = useT();
  const [state, action, pending] = useActionState(createInventoryLocation, {} as InventoryState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <label className="text-sm font-semibold md:col-span-2">{tr("fStore")} *<input required name="name" maxLength={120} placeholder="Main store" className={fieldClass} /></label>
    <div className="flex items-end"><Button disabled={pending}>{pending ? "Saving…" : "Add store"}</Button></div>
    <div className="md:col-span-3"><Feedback state={state} /></div>
  </form>;
}

export function SupplierForm() {
  const tr = useT();
  const [state, action, pending] = useActionState(createSupplier, {} as InventoryState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <label className="text-sm font-semibold">{tr("fSupplier")} *<input required name="name" maxLength={160} className={fieldClass} /></label>
    <label className="text-sm font-semibold">Contact<input name="contactName" maxLength={160} className={fieldClass} /></label>
    <label className="text-sm font-semibold">Phone<input name="phoneNumber" inputMode="tel" maxLength={40} className={fieldClass} /></label>
    <label className="text-sm font-semibold md:col-span-2">Email<input name="email" type="email" maxLength={200} className={fieldClass} /></label>
    <div className="flex items-end"><Button disabled={pending}>{pending ? "Saving…" : "Add supplier"}</Button></div>
    <div className="md:col-span-3"><Feedback state={state} /></div>
  </form>;
}

export function StockReceiptForm({ items, locations, suppliers, today }: { items: Option[]; locations: Option[]; suppliers: Option[]; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(recordStockReceipt, {} as InventoryState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <Select name="itemId" label={tr("fItem")} options={items} required defaultValue={items[0]?.id} />
    <Select name="locationId" label={tr("fStore")} options={locations} required defaultValue={locations[0]?.id} />
    <label className="text-sm font-semibold">{tr("fQuantity")} *<input required name="quantity" type="number" min="0.001" step="0.001" className={fieldClass} /></label>
    <Select name="supplierId" label={tr("fSupplier")} options={suppliers} placeholder={tr("optNotRecorded")} />
    <label className="text-sm font-semibold">{tr("fUnitCost")}<input name="unitCost" type="number" min="0" step="0.0001" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Received on *<input required name="receivedOn" type="date" defaultValue={today} className={fieldClass} /></label>
    <label className="text-sm font-semibold md:col-span-2">{tr("fReference")}<input name="reference" maxLength={120} placeholder="Delivery note" className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Receive stock"}</Button></div>
  </form>;
}

export function StockIssueForm({ items, locations, workOrders, equipment, workers, today }: { items: Option[]; locations: Option[]; workOrders: Option[]; equipment: Option[]; workers: Option[]; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(recordStockIssue, {} as InventoryState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <Select name="itemId" label={tr("fItem")} options={items} required defaultValue={items[0]?.id} />
    <Select name="locationId" label={tr("fStore")} options={locations} required defaultValue={locations[0]?.id} />
    <label className="text-sm font-semibold">{tr("fQuantity")} *<input required name="quantity" type="number" min="0.001" step="0.001" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Reason *
      <select required name="reason" defaultValue="consumption" className={selectClass}>{issueReasons.map((value) => <option key={value} value={value}>{reasonLabels[value]}</option>)}</select>
    </label>
    <Select name="workOrderId" label={tr("fWorkOrder")} options={workOrders} placeholder={tr("optNotForWorkOrder")} />
    <Select name="equipmentId" label={tr("fEquipment")} options={equipment} placeholder={tr("optNotEquipmentSpecific")} />
    <Select name="workerId" label="Collected by" options={workers} placeholder={tr("optNotRecorded")} />
    <label className="text-sm font-semibold">{tr("fIssuedOn")} *<input required name="issuedOn" type="date" defaultValue={today} className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fNotes")}<input name="notes" maxLength={500} className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Issue stock"}</Button></div>
  </form>;
}

export function StockTransferForm({ items, locations, today }: { items: Option[]; locations: Option[]; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(recordStockTransfer, {} as InventoryState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <Select name="itemId" label={tr("fItem")} options={items} required defaultValue={items[0]?.id} />
    <Select name="fromLocationId" label="From store" options={locations} required defaultValue={locations[0]?.id} />
    <Select name="toLocationId" label="To store" options={locations} required defaultValue={locations[1]?.id ?? locations[0]?.id} />
    <label className="text-sm font-semibold">{tr("fQuantity")} *<input required name="quantity" type="number" min="0.001" step="0.001" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Transferred on *<input required name="transferredOn" type="date" defaultValue={today} className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fNotes")}<input name="notes" maxLength={500} className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Transfer stock"}</Button></div>
  </form>;
}

export function StockAdjustmentForm({ items, locations, today }: { items: Option[]; locations: Option[]; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(recordStockAdjustment, {} as InventoryState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <Select name="itemId" label={tr("fItem")} options={items} required defaultValue={items[0]?.id} />
    <Select name="locationId" label={tr("fStore")} options={locations} required defaultValue={locations[0]?.id} />
    <label className="text-sm font-semibold">Quantity (+/−) *<input required name="quantityDelta" type="number" step="0.001" placeholder="-2" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Reason *
      <select required name="reason" defaultValue="correction" className={selectClass}>{adjustmentReasons.map((value) => <option key={value} value={value}>{reasonLabels[value]}</option>)}</select>
    </label>
    <label className="text-sm font-semibold md:col-span-2">Explanation *<input required name="explanation" maxLength={200} placeholder="Stock take variance" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Adjusted on *<input required name="adjustedOn" type="date" defaultValue={today} className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Adjust stock"}</Button></div>
  </form>;
}
