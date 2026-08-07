"use client";

import { useActionState } from "react";
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

const field = "mt-1 w-full rounded-lg border border-stone-300 px-3 py-2";
const submitClass = "rounded-lg bg-emerald-800 px-4 py-2.5 font-semibold text-white disabled:opacity-60";

export type Option = { id: string; label: string };

function Feedback({ state }: { state: InventoryState }) {
  if (state.error) return <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>;
  if (state.success) return <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{state.success}</p>;
  return null;
}

function Select({ name, label, options, placeholder, required, defaultValue }: { name: string; label: string; options: Option[]; placeholder?: string; required?: boolean; defaultValue?: string }) {
  return <label className="text-sm font-semibold">{label}{required ? " *" : ""}
    <select required={required} name={name} defaultValue={defaultValue ?? ""} className={`${field} bg-white`}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
  </label>;
}

export function InventoryItemForm({ categories }: { categories: Option[] }) {
  const [state, action, pending] = useActionState(createInventoryItem, {} as InventoryState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <label className="text-sm font-semibold md:col-span-2">Item *<input required name="name" maxLength={160} placeholder="Hydraulic hose 3/4in" className={field} /></label>
    <label className="text-sm font-semibold">SKU<input name="sku" maxLength={80} className={field} /></label>
    <Select name="categoryId" label="Category" options={categories} placeholder="Uncategorised" />
    <label className="text-sm font-semibold">Unit *<input required name="unit" maxLength={20} defaultValue="each" className={field} /></label>
    <label className="text-sm font-semibold">Reorder level<input name="reorderLevel" type="number" min="0" step="0.001" className={field} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><button disabled={pending} className={submitClass}>{pending ? "Saving…" : "Add item"}</button></div>
  </form>;
}

export function InventoryCategoryForm() {
  const [state, action, pending] = useActionState(createInventoryCategory, {} as InventoryState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <label className="text-sm font-semibold md:col-span-2">Category *<input required name="name" maxLength={120} placeholder="Consumables" className={field} /></label>
    <div className="flex items-end"><button disabled={pending} className={submitClass}>{pending ? "Saving…" : "Add category"}</button></div>
    <div className="md:col-span-3"><Feedback state={state} /></div>
  </form>;
}

export function InventoryLocationForm() {
  const [state, action, pending] = useActionState(createInventoryLocation, {} as InventoryState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <label className="text-sm font-semibold md:col-span-2">Store *<input required name="name" maxLength={120} placeholder="Main store" className={field} /></label>
    <div className="flex items-end"><button disabled={pending} className={submitClass}>{pending ? "Saving…" : "Add store"}</button></div>
    <div className="md:col-span-3"><Feedback state={state} /></div>
  </form>;
}

export function SupplierForm() {
  const [state, action, pending] = useActionState(createSupplier, {} as InventoryState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <label className="text-sm font-semibold">Supplier *<input required name="name" maxLength={160} className={field} /></label>
    <label className="text-sm font-semibold">Contact<input name="contactName" maxLength={160} className={field} /></label>
    <label className="text-sm font-semibold">Phone<input name="phoneNumber" inputMode="tel" maxLength={40} className={field} /></label>
    <label className="text-sm font-semibold md:col-span-2">Email<input name="email" type="email" maxLength={200} className={field} /></label>
    <div className="flex items-end"><button disabled={pending} className={submitClass}>{pending ? "Saving…" : "Add supplier"}</button></div>
    <div className="md:col-span-3"><Feedback state={state} /></div>
  </form>;
}

export function StockReceiptForm({ items, locations, suppliers, today }: { items: Option[]; locations: Option[]; suppliers: Option[]; today: string }) {
  const [state, action, pending] = useActionState(recordStockReceipt, {} as InventoryState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <Select name="itemId" label="Item" options={items} required defaultValue={items[0]?.id} />
    <Select name="locationId" label="Store" options={locations} required defaultValue={locations[0]?.id} />
    <label className="text-sm font-semibold">Quantity *<input required name="quantity" type="number" min="0.001" step="0.001" className={field} /></label>
    <Select name="supplierId" label="Supplier" options={suppliers} placeholder="Not recorded" />
    <label className="text-sm font-semibold">Unit cost<input name="unitCost" type="number" min="0" step="0.0001" className={field} /></label>
    <label className="text-sm font-semibold">Received on *<input required name="receivedOn" type="date" defaultValue={today} className={field} /></label>
    <label className="text-sm font-semibold md:col-span-2">Reference<input name="reference" maxLength={120} placeholder="Delivery note" className={field} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><button disabled={pending} className={submitClass}>{pending ? "Saving…" : "Receive stock"}</button></div>
  </form>;
}

export function StockIssueForm({ items, locations, workOrders, equipment, workers, today }: { items: Option[]; locations: Option[]; workOrders: Option[]; equipment: Option[]; workers: Option[]; today: string }) {
  const [state, action, pending] = useActionState(recordStockIssue, {} as InventoryState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <Select name="itemId" label="Item" options={items} required defaultValue={items[0]?.id} />
    <Select name="locationId" label="Store" options={locations} required defaultValue={locations[0]?.id} />
    <label className="text-sm font-semibold">Quantity *<input required name="quantity" type="number" min="0.001" step="0.001" className={field} /></label>
    <label className="text-sm font-semibold">Reason *
      <select required name="reason" defaultValue="consumption" className={`${field} bg-white`}>{issueReasons.map((value) => <option key={value} value={value}>{reasonLabels[value]}</option>)}</select>
    </label>
    <Select name="workOrderId" label="Work order" options={workOrders} placeholder="Not for a work order" />
    <Select name="equipmentId" label="Equipment" options={equipment} placeholder="Not equipment specific" />
    <Select name="workerId" label="Collected by" options={workers} placeholder="Not recorded" />
    <label className="text-sm font-semibold">Issued on *<input required name="issuedOn" type="date" defaultValue={today} className={field} /></label>
    <label className="text-sm font-semibold">Notes<input name="notes" maxLength={500} className={field} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><button disabled={pending} className={submitClass}>{pending ? "Saving…" : "Issue stock"}</button></div>
  </form>;
}

export function StockTransferForm({ items, locations, today }: { items: Option[]; locations: Option[]; today: string }) {
  const [state, action, pending] = useActionState(recordStockTransfer, {} as InventoryState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <Select name="itemId" label="Item" options={items} required defaultValue={items[0]?.id} />
    <Select name="fromLocationId" label="From store" options={locations} required defaultValue={locations[0]?.id} />
    <Select name="toLocationId" label="To store" options={locations} required defaultValue={locations[1]?.id ?? locations[0]?.id} />
    <label className="text-sm font-semibold">Quantity *<input required name="quantity" type="number" min="0.001" step="0.001" className={field} /></label>
    <label className="text-sm font-semibold">Transferred on *<input required name="transferredOn" type="date" defaultValue={today} className={field} /></label>
    <label className="text-sm font-semibold">Notes<input name="notes" maxLength={500} className={field} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><button disabled={pending} className={submitClass}>{pending ? "Saving…" : "Transfer stock"}</button></div>
  </form>;
}

export function StockAdjustmentForm({ items, locations, today }: { items: Option[]; locations: Option[]; today: string }) {
  const [state, action, pending] = useActionState(recordStockAdjustment, {} as InventoryState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <Select name="itemId" label="Item" options={items} required defaultValue={items[0]?.id} />
    <Select name="locationId" label="Store" options={locations} required defaultValue={locations[0]?.id} />
    <label className="text-sm font-semibold">Quantity (+/−) *<input required name="quantityDelta" type="number" step="0.001" placeholder="-2" className={field} /></label>
    <label className="text-sm font-semibold">Reason *
      <select required name="reason" defaultValue="correction" className={`${field} bg-white`}>{adjustmentReasons.map((value) => <option key={value} value={value}>{reasonLabels[value]}</option>)}</select>
    </label>
    <label className="text-sm font-semibold md:col-span-2">Explanation *<input required name="explanation" maxLength={200} placeholder="Stock take variance" className={field} /></label>
    <label className="text-sm font-semibold">Adjusted on *<input required name="adjustedOn" type="date" defaultValue={today} className={field} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><button disabled={pending} className={submitClass}>{pending ? "Saving…" : "Adjust stock"}</button></div>
  </form>;
}
