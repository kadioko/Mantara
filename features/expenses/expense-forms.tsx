"use client";

import { useActionState } from "react";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { fieldClass, selectClass } from "@/components/ui/form";
import {
  createBudget,
  createExpense,
  createExpenseCategory,
  reviewExpense,
  updateExpenseStatus,
  type ExpenseState,
} from "./actions";
import { budgetPeriodLabels, budgetPeriods } from "./schemas";


export type Option = { id: string; label: string };

function Feedback({ state }: { state: ExpenseState }) {
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

export function ExpenseCategoryForm() {
  const tr = useT();
  const [state, action, pending] = useActionState(createExpenseCategory, {} as ExpenseState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <label className="text-sm font-semibold md:col-span-2">{tr("fCategory")} *<input required name="name" maxLength={120} placeholder="Fuel and lubricants" className={fieldClass} /></label>
    <div className="flex items-end"><Button disabled={pending}>{pending ? "Saving…" : "Add category"}</Button></div>
    <div className="md:col-span-3"><Feedback state={state} /></div>
  </form>;
}

export function ExpenseForm({ categories, suppliers, workOrders, currency, today }: { categories: Option[]; suppliers: Option[]; workOrders: Option[]; currency: string; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(createExpense, {} as ExpenseState);
  return <form action={action} className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-3">
    <div className="md:col-span-3"><h2 className="text-lg font-bold">Record an expense</h2><p className="mt-1 text-sm text-muted-foreground">Expenses start as drafts and must be submitted for approval.</p></div>
    <label className="text-sm font-semibold md:col-span-2">{tr("fDescription")} *<input required name="description" maxLength={200} placeholder="Diesel delivery" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fAmount")} *<input required name="amount" type="number" min="0.01" step="0.01" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fCurrency")} *<input required name="currencyCode" maxLength={3} defaultValue={currency} className={`${fieldClass} uppercase`} /></label>
    <label className="text-sm font-semibold">{tr("fIncurredOn")} *<input required name="incurredOn" type="date" defaultValue={today} className={fieldClass} /></label>
    <OptionSelect name="categoryId" label={tr("fCategory")} options={categories} placeholder={tr("optUncategorised")} />
    <OptionSelect name="supplierId" label={tr("fSupplier")} options={suppliers} placeholder={tr("optNotRecorded")} />
    <OptionSelect name="workOrderId" label={tr("fWorkOrder")} options={workOrders} placeholder={tr("optNotForWorkOrder")} />
    <label className="text-sm font-semibold">{tr("fReference")}<input name="reference" maxLength={120} placeholder="Invoice number" className={fieldClass} /></label>
    <label className="text-sm font-semibold md:col-span-3">{tr("fNotes")}<input name="notes" maxLength={2000} className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div className="md:col-span-3"><Button disabled={pending}>{pending ? "Saving…" : "Save draft"}</Button></div>
  </form>;
}

export function ExpenseStatusForm({ expenseId, allowed, label }: { expenseId: string; allowed: string[]; label: string }) {
  const [state, action, pending] = useActionState(updateExpenseStatus, {} as ExpenseState);
  if (!allowed.length) return null;
  return <form action={action} className="space-y-3">
    <input name="expenseId" type="hidden" value={expenseId} />
    <input name="status" type="hidden" value={allowed[0]} />
    <Feedback state={state} />
    <Button disabled={pending}>{pending ? "Saving…" : label}</Button>
  </form>;
}

export function ExpenseReviewForm({ expenseId }: { expenseId: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(reviewExpense, {} as ExpenseState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <input name="expenseId" type="hidden" value={expenseId} />
    <label className="text-sm font-semibold">Decision *
      <select name="decision" defaultValue="approved" className={selectClass}>
        <option value="approved">{tr("actApprove")}</option>
        <option value="rejected">{tr("actReject")}</option>
      </select>
    </label>
    <label className="text-sm font-semibold md:col-span-2">{tr("fNotes")}<input name="notes" maxLength={500} placeholder="Checked against invoice" className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Record decision"}</Button></div>
  </form>;
}

export function BudgetForm({ categories, currency, today }: { categories: Option[]; currency: string; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(createBudget, {} as ExpenseState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <label className="text-sm font-semibold md:col-span-2">Budget name *<input required name="name" maxLength={120} placeholder="Q3 fuel budget" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Period *
      <select required name="period" defaultValue="monthly" className={selectClass}>{budgetPeriods.map((value) => <option key={value} value={value}>{budgetPeriodLabels[value]}</option>)}</select>
    </label>
    <label className="text-sm font-semibold">{tr("fAmount")} *<input required name="amount" type="number" min="0.01" step="0.01" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fCurrency")} *<input required name="currencyCode" maxLength={3} defaultValue={currency} className={`${fieldClass} uppercase`} /></label>
    <OptionSelect name="categoryId" label={tr("fCategory")} options={categories} placeholder="All categories" />
    <label className="text-sm font-semibold">{tr("fStartsOn")} *<input required name="startsOn" type="date" defaultValue={today} className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fEndsOn")} *<input required name="endsOn" type="date" className={fieldClass} /></label>
    <label className="flex items-end gap-2 text-sm font-semibold">
      <input name="siteScoped" type="checkbox" value="true" className="mb-3 h-4 w-4" />
      <span className="mb-2.5">This mine site only</span>
    </label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Add budget"}</Button></div>
  </form>;
}
