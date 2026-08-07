"use client";

import { useActionState, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ActionFeedback, Alert } from "@/components/ui/feedback";
import { removeWorker, updateWorker, type WorkerState } from "./actions";

export type WorkerDetails = {
  id: string;
  full_name: string;
  employee_number: string | null;
  phone_number: string | null;
  job_title: string | null;
  employment_type: string;
  start_date: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
};

const selectClass = "mt-1 flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function EditWorkerForm({ worker }: { worker: WorkerDetails }) {
  const [state, action, pending] = useActionState(updateWorker, {} as WorkerState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Pencil aria-hidden />Edit details</Button>;
  }

  return <form action={action} className="grid gap-4 md:grid-cols-2">
    <input name="workerId" type="hidden" value={worker.id} />
    <div><Label htmlFor="fullName">Full name *</Label><Input id="fullName" name="fullName" required maxLength={160} defaultValue={worker.full_name} className="mt-1" /></div>
    <div><Label htmlFor="employeeNumber">Employee or contractor number</Label><Input id="employeeNumber" name="employeeNumber" maxLength={80} defaultValue={worker.employee_number ?? ""} className="mt-1" /></div>
    <div><Label htmlFor="phoneNumber">Phone number</Label><Input id="phoneNumber" name="phoneNumber" inputMode="tel" maxLength={40} defaultValue={worker.phone_number ?? ""} className="mt-1" /></div>
    <div><Label htmlFor="jobTitle">Job title</Label><Input id="jobTitle" name="jobTitle" maxLength={100} defaultValue={worker.job_title ?? ""} className="mt-1" /></div>
    <div>
      <Label htmlFor="employmentType">Employment type *</Label>
      <select id="employmentType" name="employmentType" required defaultValue={worker.employment_type} className={selectClass}>
        <option value="employee">Employee</option>
        <option value="contractor">Contractor</option>
        <option value="casual">Casual</option>
      </select>
    </div>
    <div><Label htmlFor="startDate">Start date</Label><Input id="startDate" name="startDate" type="date" defaultValue={worker.start_date ?? ""} className="mt-1" /></div>
    <div><Label htmlFor="emergencyContactName">Emergency contact name</Label><Input id="emergencyContactName" name="emergencyContactName" maxLength={160} defaultValue={worker.emergency_contact_name ?? ""} className="mt-1" /></div>
    <div><Label htmlFor="emergencyContactPhone">Emergency contact phone</Label><Input id="emergencyContactPhone" name="emergencyContactPhone" inputMode="tel" maxLength={40} defaultValue={worker.emergency_contact_phone ?? ""} className="mt-1" /></div>
    <div className="md:col-span-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" name="notes" maxLength={2000} rows={2} defaultValue={worker.notes ?? ""} className="mt-1" /></div>
    <div className="md:col-span-2"><ActionFeedback state={state} /></div>
    <div className="flex gap-2 md:col-span-2">
      <Button disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </div>
  </form>;
}

/**
 * Removal is a soft delete, so history stays meaningful. Typing the name is the confirmation, since a
 * plain button is too easy to hit by accident on a phone at a mine site.
 */
export function RemoveWorkerForm({ workerId, workerName }: { workerId: string; workerName: string }) {
  const [state, action, pending] = useActionState(removeWorker, {} as WorkerState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => setOpen(true)}>
      <Trash2 aria-hidden />Remove from register
    </Button>;
  }

  return <form action={action} className="space-y-3">
    <input name="workerId" type="hidden" value={workerId} />
    <Alert variant="warning">
      Removing takes this person off the register. Their attendance, assignments, training, and PPE history are kept.
    </Alert>
    <div>
      <Label htmlFor="confirmName">Type <span className="font-semibold">{workerName}</span> to confirm</Label>
      <Input id="confirmName" name="confirmName" required autoComplete="off" className="mt-1 max-w-sm" />
    </div>
    <ActionFeedback state={state} />
    <div className="flex gap-2">
      <Button disabled={pending} variant="destructive">{pending ? "Removing…" : "Remove worker"}</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </div>
  </form>;
}
