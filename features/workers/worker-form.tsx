"use client";

import { useActionState } from "react";
import { createWorker, type WorkerState } from "./actions";

export function WorkerForm() {
  const [state, action, pending] = useActionState(createWorker, {} as WorkerState);
  return <form action={action} className="grid gap-4 rounded-xl border border-stone-200 bg-white p-5 md:grid-cols-2">
    <div className="md:col-span-2"><h2 className="text-lg font-bold">Register worker</h2><p className="mt-1 text-sm text-stone-600">Fields marked required are needed to create the personnel record.</p></div>
    <label className="text-sm font-semibold">Full name *<input required name="fullName" maxLength={160} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" /></label>
    <label className="text-sm font-semibold">Employee or contractor number<input name="employeeNumber" maxLength={80} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" /></label>
    <label className="text-sm font-semibold">Phone number<input name="phoneNumber" inputMode="tel" maxLength={40} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" /></label>
    <label className="text-sm font-semibold">Job title<input name="jobTitle" maxLength={100} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" placeholder="Excavator operator" /></label>
    <label className="text-sm font-semibold">Employment type *<select required name="employmentType" defaultValue="employee" className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2"><option value="employee">Employee</option><option value="contractor">Contractor</option><option value="casual">Casual</option></select></label>
    <label className="text-sm font-semibold">Start date<input name="startDate" type="date" className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" /></label>
    <label className="text-sm font-semibold">Emergency contact name<input name="emergencyContactName" maxLength={160} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" /></label>
    <label className="text-sm font-semibold">Emergency contact phone<input name="emergencyContactPhone" inputMode="tel" maxLength={40} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" /></label>
    <label className="text-sm font-semibold md:col-span-2">Notes<textarea name="notes" maxLength={2000} rows={3} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" /></label>
    {state.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 md:col-span-2">{state.error}</p>}
    {state.success && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 md:col-span-2">{state.success}</p>}
    <div className="md:col-span-2"><button disabled={pending} className="rounded-lg bg-emerald-800 px-4 py-3 font-semibold text-white disabled:opacity-60">{pending ? "Registering…" : "Register worker"}</button></div>
  </form>;
}
