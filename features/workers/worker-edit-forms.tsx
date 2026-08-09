"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { selectClass } from "@/components/ui/form";
import { Pencil, Trash2 } from "lucide-react";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ActionFeedback, Alert } from "@/components/ui/feedback";
import { useT } from "@/lib/i18n/client";
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


export function EditWorkerForm({ worker }: { worker: WorkerDetails }) {
  const tr = useT();
  const [state, action, pending] = useActionState(updateWorker, {} as WorkerState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Pencil aria-hidden />{tr("editDetails")}</Button>;
  }

  return <form action={action} className="grid gap-4 md:grid-cols-2">
    <input name="workerId" type="hidden" value={worker.id} />
    <div><Label htmlFor="fullName">{tr("fullName")} *</Label><Input id="fullName" name="fullName" required maxLength={160} defaultValue={worker.full_name} className="mt-1" /></div>
    <div><Label htmlFor="employeeNumber">{tr("employeeNumber")}</Label><Input id="employeeNumber" name="employeeNumber" maxLength={80} defaultValue={worker.employee_number ?? ""} className="mt-1" /></div>
    <div><Label htmlFor="phoneNumber">{tr("phoneNumber")}</Label><Input id="phoneNumber" name="phoneNumber" inputMode="tel" maxLength={40} defaultValue={worker.phone_number ?? ""} className="mt-1" /></div>
    <div><Label htmlFor="jobTitle">{tr("jobTitle")}</Label><Input id="jobTitle" name="jobTitle" maxLength={100} defaultValue={worker.job_title ?? ""} className="mt-1" /></div>
    <div>
      <Label htmlFor="employmentType">{tr("employmentType")} *</Label>
      <select id="employmentType" name="employmentType" required defaultValue={worker.employment_type} className={selectClass}>
        <option value="employee">{tr("employee")}</option>
        <option value="contractor">{tr("contractor")}</option>
        <option value="casual">{tr("casual")}</option>
      </select>
    </div>
    <div><Label htmlFor="startDate">{tr("startDate")}</Label><Input id="startDate" name="startDate" type="date" defaultValue={worker.start_date ?? ""} className="mt-1" /></div>
    <div><Label htmlFor="emergencyContactName">{tr("emergencyContactName")}</Label><Input id="emergencyContactName" name="emergencyContactName" maxLength={160} defaultValue={worker.emergency_contact_name ?? ""} className="mt-1" /></div>
    <div><Label htmlFor="emergencyContactPhone">{tr("emergencyContactPhone")}</Label><Input id="emergencyContactPhone" name="emergencyContactPhone" inputMode="tel" maxLength={40} defaultValue={worker.emergency_contact_phone ?? ""} className="mt-1" /></div>
    <div className="md:col-span-2"><Label htmlFor="notes">{tr("notes")}</Label><Textarea id="notes" name="notes" maxLength={2000} rows={2} defaultValue={worker.notes ?? ""} className="mt-1" /></div>
    <div className="md:col-span-2"><ActionFeedback state={state} /></div>
    <div className="flex gap-2 md:col-span-2">
      <Button disabled={pending}>{pending ? tr("saving") : tr("actSaveChanges")}</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{tr("cancel")}</Button>
    </div>
  </form>;
}

/**
 * Removal is a soft delete, so history stays meaningful. Typing the name is the confirmation, since a
 * plain button is too easy to hit by accident on a phone at a mine site.
 */
export function RemoveWorkerForm({ workerId, workerName }: { workerId: string; workerName: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(removeWorker, {} as WorkerState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => setOpen(true)}>
      <Trash2 aria-hidden />{tr("removeFromRegister")}
    </Button>;
  }

  return <form action={action} className="space-y-3">
    <input name="workerId" type="hidden" value={workerId} />
    <Alert variant="warning">
      {tr("removeWorkerWarning")}
    </Alert>
    <div>
      <Label htmlFor="confirmName">{tr("typeToConfirm")} <span className="font-semibold">{workerName}</span></Label>
      <Input id="confirmName" name="confirmName" required autoComplete="off" className="mt-1 max-w-sm" />
    </div>
    <ActionFeedback state={state} />
    <div className="flex gap-2">
      <Button disabled={pending} variant="destructive">{pending ? tr("removing") : tr("removeWorker")}</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{tr("cancel")}</Button>
    </div>
  </form>;
}
