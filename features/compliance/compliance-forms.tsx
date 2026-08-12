"use client";

import { useActionState } from "react";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { selectClass } from "@/components/ui/form";
import { CheckCircle2 } from "lucide-react";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ActionFeedback } from "@/components/ui/feedback";
import {
  completeComplianceTask,
  createComplianceTask,
  createLicence,
  createRequirement,
  type ComplianceState,
} from "./actions";
import { licenceStatusLabels, licenceStatuses, recurrenceIntervals, recurrenceLabels } from "./schemas";

export type Option = { id: string; label: string };


function Select({ name, label, options, placeholder, required, defaultValue }: { name: string; label: string; options: Option[]; placeholder?: string; required?: boolean; defaultValue?: string }) {
  return <div>
    <Label htmlFor={name}>{label}{required ? " *" : ""}</Label>
    <select id={name} name={name} required={required} defaultValue={defaultValue ?? ""} className={selectClass}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
  </div>;
}

export function LicenceForm() {
  const tr = useT();
  const [state, action, pending] = useActionState(createLicence, {} as ComplianceState);
  return <form action={action} className="grid gap-4 md:grid-cols-3">
    <div><Label htmlFor="licenceNumber">{tr("uiLicenceNumber")}</Label><Input id="licenceNumber" name="licenceNumber" required maxLength={120} className="mt-1" /></div>
    <div><Label htmlFor="licenceType">{tr("uiLicenceType")}</Label><Input id="licenceType" name="licenceType" required maxLength={120} placeholder={tr("uiPrimaryMiningLicence")} className="mt-1" /></div>
    <Select name="status" label={tr("fStatus")} required defaultValue="active" options={licenceStatuses.map((value) => ({ id: value, label: licenceStatusLabels[value] }))} />
    <div><Label htmlFor="issuingAuthority">{tr("fIssuingAuthority")}</Label><Input id="issuingAuthority" name="issuingAuthority" maxLength={160} className="mt-1" /></div>
    <div><Label htmlFor="holderName">{tr("fHolder")}</Label><Input id="holderName" name="holderName" maxLength={160} className="mt-1" /></div>
    <div />
    <div><Label htmlFor="issuedOn">{tr("fIssuedOn")}</Label><Input id="issuedOn" name="issuedOn" type="date" className="mt-1" /></div>
    <div><Label htmlFor="expiresOn">{tr("fExpiresOn")}</Label><Input id="expiresOn" name="expiresOn" type="date" className="mt-1" /></div>
    <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
      <input name="siteScoped" type="checkbox" value="true" className="size-4" />
      This mine site only
    </label>
    <div className="md:col-span-3"><Label htmlFor="notes">{tr("notes")}</Label><Textarea id="notes" name="notes" maxLength={2000} rows={2} className="mt-1" /></div>
    <div className="md:col-span-3"><ActionFeedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Record licence"}</Button></div>
  </form>;
}

export function RequirementForm() {
  const tr = useT();
  const [state, action, pending] = useActionState(createRequirement, {} as ComplianceState);
  return <form action={action} className="grid gap-4 md:grid-cols-3">
    <div className="md:col-span-2"><Label htmlFor="name">{tr("uiRequirement")}</Label><Input id="name" name="name" required maxLength={160} placeholder={tr("uiQuarterlyEnvironmentalReturn")} className="mt-1" /></div>
    <Select name="recurrence" label={tr("fRecurrence")} required defaultValue="none" options={recurrenceIntervals.map((value) => ({ id: value, label: recurrenceLabels[value] }))} />
    <div><Label htmlFor="category">{tr("fCategory")}</Label><Input id="category" name="category" maxLength={120} placeholder={tr("uiEnvironmental")} className="mt-1" /></div>
    <div className="md:col-span-2"><Label htmlFor="description">{tr("description")}</Label><Input id="description" name="description" maxLength={2000} className="mt-1" /></div>
    <div className="md:col-span-3"><ActionFeedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Add requirement"}</Button></div>
  </form>;
}

export function ComplianceTaskForm({ requirements, licences, workers, today }: { requirements: Option[]; licences: Option[]; workers: Option[]; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(createComplianceTask, {} as ComplianceState);
  return <form action={action} className="grid gap-4 md:grid-cols-3">
    <div className="md:col-span-2"><Label htmlFor="title">{tr("uiTask")}</Label><Input id="title" name="title" required maxLength={160} placeholder={tr("uiSubmitQuarterlyReturn")} className="mt-1" /></div>
    <div><Label htmlFor="dueOn">{tr("uiDueOn")}</Label><Input id="dueOn" name="dueOn" type="date" required defaultValue={today} className="mt-1" /></div>
    <Select name="requirementId" label={tr("fRequirement")} options={requirements} placeholder={tr("optNotLinked")} />
    <Select name="licenceId" label={tr("fLicence")} options={licences} placeholder={tr("optNotLinked")} />
    <Select name="assignedWorkerId" label={tr("fAssignedTo")} options={workers} placeholder={tr("optUnassigned")} />
    <div className="md:col-span-2"><Label htmlFor="details">{tr("pDetails")}</Label><Input id="details" name="details" maxLength={2000} className="mt-1" /></div>
    <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
      <input name="siteScoped" type="checkbox" value="true" className="size-4" />
      This mine site only
    </label>
    <div className="md:col-span-3"><ActionFeedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Schedule task"}</Button></div>
  </form>;
}

export function CompleteTaskForm({ taskId, today, recurring }: { taskId: string; today: string; recurring: boolean }) {
  const tr = useT();
  const [state, action, pending] = useActionState(completeComplianceTask, {} as ComplianceState);
  return <form action={action} className="flex flex-wrap items-end gap-2">
    <input name="taskId" type="hidden" value={taskId} />
    <input name="completedOn" type="hidden" value={today} />
    <Input name="notes" maxLength={500} aria-label={tr("fCompletionNotes")} placeholder={recurring ? "Notes — the next one is scheduled automatically" : "Completion notes"} className="h-9 w-full sm:w-72" />
    <Button disabled={pending} size="sm" variant="outline"><CheckCircle2 aria-hidden />{pending ? "Saving…" : "Complete"}</Button>
    <div className="w-full"><ActionFeedback state={state} /></div>
  </form>;
}
