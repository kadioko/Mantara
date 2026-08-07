"use client";

import { useActionState } from "react";
import {
  createBudget,
  createExpense,
  createExpenseCategory,
  reviewExpense,
  updateExpenseStatus,
  type ExpenseState,
} from "./actions";
import { budgetPeriodLabels, budgetPeriods } from "./schemas";

const field = "mt-1 w-full rounded-lg border border-stone-300 px-3 py-2";
const submitClass = "rounded-lg bg-emerald-800 px-4 py-2.5 font-semibold text-white disabled:opacity-60";

export type Option = { id: string; label: string };

function Feedback({ state }: { state: ExpenseState }) {
  if (state.error) return <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>;
  if (state.success) return <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{state.success}</p>;
  return null;
}

function OptionSelect({ name, label, options, placeholder }: { name: string; label: string; options: Option[]; placeholder: string }) {
  return <label className="text-sm font-semibold">{label}
    <select name={name} defaultValue="" className={`${field} bg-white`}>
      <option value="">{placeholder}</option>
      {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
  </label>;
}

export function ExpenseCategoryForm() {
  const [state, action, pending] = useActionState(createExpenseCategory, {} as ExpenseState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <label className="text-sm font-semibold md:col-span-2">Category *<input required name="name" maxLength={120} placeholder="Fuel and lubricants" className={field} /></label>
    <div className="flex items-end"><button disabled={pending} className={submitClass}>{pending ? "Saving…" : "Add category"}</button></div>
    <div className="md:col-span-3"><Feedback state={state} /></div>
  </form>;
}

export function ExpenseForm({ categories, suppliers, workOrders, currency, today }: { categories: Option[]; suppliers: Option[]; workOrders: Option[]; currency: string; today: string }) {
  const [state, action, pending] = useActionState(createExpense, {} as ExpenseState);
  return <form action={action} className="grid gap-4 rounded-xl border border-stone-200 bg-white p-5 md:grid-cols-3">
    <div className="md:col-span-3"><h2 className="text-lg font-bold">Record an expense</h2><p className="mt-1 text-sm text-stone-600">Expenses start as drafts and must be submitted for approval.</p></div>
    <label className="text-sm font-semibold md:col-span-2">Description *<input required name="description" maxLength={200} placeholder="Diesel delivery" className={field} /></label>
    <label className="text-sm font-semibold">Amount *<input required name="amount" type="number" min="0.01" step="0.01" className={field} /></label>
    <label className="text-sm font-semibold">Currency *<input required name="currencyCode" maxLength={3} defaultValue={currency} className={`${field} uppercase`} /></label>
    <label className="text-sm font-semibold">Incurred on *<input required name="incurredOn" type="date" defaultValue={today} className={field} /></label>
    <OptionSelect name="categoryId" label="Category" options={categories} placeholder="Uncategorised" />
    <OptionSelect name="supplierId" label="Supplier" options={suppliers} placeholder="Not recorded" />
    <OptionSelect name="workOrderId" label="Work order" options={workOrders} placeholder="Not for a work order" />
    <label className="text-sm font-semibold">Reference<input name="reference" maxLength={120} placeholder="Invoice number" className={field} /></label>
    <label className="text-sm font-semibold md:col-span-3">Notes<input name="notes" maxLength={2000} className={field} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div className="md:col-span-3"><button disabled={pending} className={submitClass}>{pending ? "Saving…" : "Save draft"}</button></div>
  </form>;
}

export function ExpenseStatusForm({ expenseId, allowed, label }: { expenseId: string; allowed: string[]; label: string }) {
  const [state, action, pending] = useActionState(updateExpenseStatus, {} as ExpenseState);
  if (!allowed.length) return null;
  return <form action={action} className="space-y-3">
    <input name="expenseId" type="hidden" value={expenseId} />
    <input name="status" type="hidden" value={allowed[0]} />
    <Feedback state={state} />
    <button disabled={pending} className={submitClass}>{pending ? "Saving…" : label}</button>
  </form>;
}

export function ExpenseReviewForm({ expenseId }: { expenseId: string }) {
  const [state, action, pending] = useActionState(reviewExpense, {} as ExpenseState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <input name="expenseId" type="hidden" value={expenseId} />
    <label className="text-sm font-semibold">Decision *
      <select name="decision" defaultValue="approved" className={`${field} bg-white`}>
        <option value="approved">Approve</option>
        <option value="rejected">Reject</option>
      </select>
    </label>
    <label className="text-sm font-semibold md:col-span-2">Notes<input name="notes" maxLength={500} placeholder="Checked against invoice" className={field} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><button disabled={pending} className={submitClass}>{pending ? "Saving…" : "Record decision"}</button></div>
  </form>;
}

export function BudgetForm({ categories, currency, today }: { categories: Option[]; currency: string; today: string }) {
  const [state, action, pending] = useActionState(createBudget, {} as ExpenseState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <label className="text-sm font-semibold md:col-span-2">Budget name *<input required name="name" maxLength={120} placeholder="Q3 fuel budget" className={field} /></label>
    <label className="text-sm font-semibold">Period *
      <select required name="period" defaultValue="monthly" className={`${field} bg-white`}>{budgetPeriods.map((value) => <option key={value} value={value}>{budgetPeriodLabels[value]}</option>)}</select>
    </label>
    <label className="text-sm font-semibold">Amount *<input required name="amount" type="number" min="0.01" step="0.01" className={field} /></label>
    <label className="text-sm font-semibold">Currency *<input required name="currencyCode" maxLength={3} defaultValue={currency} className={`${field} uppercase`} /></label>
    <OptionSelect name="categoryId" label="Category" options={categories} placeholder="All categories" />
    <label className="text-sm font-semibold">Starts on *<input required name="startsOn" type="date" defaultValue={today} className={field} /></label>
    <label className="text-sm font-semibold">Ends on *<input required name="endsOn" type="date" className={field} /></label>
    <label className="flex items-end gap-2 text-sm font-semibold">
      <input name="siteScoped" type="checkbox" value="true" className="mb-3 h-4 w-4" />
      <span className="mb-2.5">This mine site only</span>
    </label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><button disabled={pending} className={submitClass}>{pending ? "Saving…" : "Add budget"}</button></div>
  </form>;
}
