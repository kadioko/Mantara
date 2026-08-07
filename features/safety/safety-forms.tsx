"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { selectClass } from "@/components/ui/form";
import { Eye, Lock, ShieldAlert } from "lucide-react";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ActionFeedback, Alert } from "@/components/ui/feedback";
import {
  createCorrectiveAction,
  createIncident,
  createInspection,
  revealIncidentDetails,
  saveIncidentDetails,
  updateCorrectiveAction,
  updateIncidentStatus,
  type SafetyState,
  type SensitiveDetailsState,
} from "./actions";
import {
  categoryLabels,
  correctiveActionStatuses,
  actionStatusLabels,
  incidentCategories,
  incidentSeverities,
  incidentStatuses,
  severityLabels,
  statusLabels,
} from "./schemas";

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

export function IncidentForm({ workers, equipment, today }: { workers: Option[]; equipment: Option[]; today: string }) {
  const [state, action, pending] = useActionState(createIncident, {} as SafetyState);
  return <form action={action} className="grid gap-4 md:grid-cols-3">
    <div className="md:col-span-2"><Label htmlFor="title">What happened *</Label><Input id="title" name="title" required maxLength={160} placeholder="Operator struck by falling rock" className="mt-1" /></div>
    <div><Label htmlFor="reference">Reference</Label><Input id="reference" name="reference" maxLength={80} className="mt-1" /></div>
    <Select name="category" label="Category" required defaultValue="other" options={incidentCategories.map((value) => ({ id: value, label: categoryLabels[value] }))} />
    <Select name="severity" label="Severity" required defaultValue="low" options={incidentSeverities.map((value) => ({ id: value, label: severityLabels[value] }))} />
    <div><Label htmlFor="location">Location</Label><Input id="location" name="location" maxLength={160} placeholder="Pit 2 bench 4" className="mt-1" /></div>
    <div><Label htmlFor="occurredOn">Date *</Label><Input id="occurredOn" name="occurredOn" type="date" required defaultValue={today} className="mt-1" /></div>
    <div><Label htmlFor="occurredTime">Time</Label><Input id="occurredTime" name="occurredTime" type="time" className="mt-1" /></div>
    <div><Label htmlFor="peopleInvolved">People involved</Label><Input id="peopleInvolved" name="peopleInvolved" type="number" min="0" step="1" className="mt-1" /></div>
    <Select name="reportedByWorkerId" label="Reported by" options={workers} placeholder="Not recorded" />
    <Select name="equipmentId" label="Equipment involved" options={equipment} placeholder="None" />
    <div><Label htmlFor="lostTimeHours">Lost time (hours)</Label><Input id="lostTimeHours" name="lostTimeHours" type="number" min="0" step="0.5" className="mt-1" /></div>
    <div className="md:col-span-3">
      <Label htmlFor="summary">Summary</Label>
      <Textarea id="summary" name="summary" maxLength={4000} rows={3} className="mt-1" />
      <p className="mt-1 text-xs text-muted-foreground">
        Keep personal and medical information out of this field. Record it under sensitive details, where access is
        restricted and logged.
      </p>
    </div>
    <div className="md:col-span-3"><ActionFeedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Report incident"}</Button></div>
  </form>;
}

export function IncidentStatusForm({ incidentId, status }: { incidentId: string; status: string }) {
  const [state, action, pending] = useActionState(updateIncidentStatus, {} as SafetyState);
  return <form action={action} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
    <input name="incidentId" type="hidden" value={incidentId} />
    <Select name="status" label="Status" defaultValue={status} options={incidentStatuses.map((value) => ({ id: value, label: statusLabels[value] }))} />
    <Button disabled={pending}>{pending ? "Saving…" : "Update"}</Button>
    <div className="sm:col-span-2"><ActionFeedback state={state} /></div>
  </form>;
}

/**
 * Sensitive details are never rendered on page load. The reader asks for them explicitly, which makes
 * the audit entry correspond to a real intent to view rather than an incidental page visit.
 */
export function SensitiveDetailsPanel({ incidentId, hasDetails, canRead }: { incidentId: string; hasDetails: boolean; canRead: boolean }) {
  const [state, action, pending] = useActionState(revealIncidentDetails, {} as SensitiveDetailsState);

  if (!canRead) {
    return <Alert variant="info" className="flex items-start gap-3">
      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        {hasDetails
          ? "This incident has personal or medical details. Viewing them needs the sensitive safety permission."
          : "No sensitive details have been recorded for this incident."}
      </span>
    </Alert>;
  }

  if (!state.revealed) {
    return <form action={action} className="space-y-3">
      <input name="incidentId" type="hidden" value={incidentId} />
      <Alert variant="warning" className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          {hasDetails
            ? "Personal and medical information is held for this incident. Opening it is recorded in the audit log against your name."
            : "No sensitive details have been recorded yet."}
        </span>
      </Alert>
      {hasDetails && <Button disabled={pending} variant="outline" size="sm"><Eye aria-hidden />{pending ? "Opening…" : "View sensitive details"}</Button>}
      <ActionFeedback state={state} />
    </form>;
  }

  return <div className="space-y-3">
    <ActionFeedback state={state} />
    <dl className="grid gap-4 sm:grid-cols-2">
      <div><dt className="text-sm text-muted-foreground">Injury</dt><dd className="mt-0.5">{state.details?.injury_description || "—"}</dd></div>
      <div><dt className="text-sm text-muted-foreground">Medical notes</dt><dd className="mt-0.5">{state.details?.medical_notes || "—"}</dd></div>
      <div className="sm:col-span-2"><dt className="text-sm text-muted-foreground">Personal details</dt><dd className="mt-0.5">{state.details?.personal_details || "—"}</dd></div>
    </dl>
  </div>;
}

export function SensitiveDetailsForm({ incidentId, workers }: { incidentId: string; workers: Option[] }) {
  const [state, action, pending] = useActionState(saveIncidentDetails, {} as SafetyState);
  return <form action={action} className="grid gap-4 md:grid-cols-2">
    <input name="incidentId" type="hidden" value={incidentId} />
    <Select name="injuredWorkerId" label="Injured person" options={workers} placeholder="Not recorded" />
    <div><Label htmlFor="injuryDescription">Injury</Label><Input id="injuryDescription" name="injuryDescription" maxLength={2000} className="mt-1" /></div>
    <div><Label htmlFor="medicalNotes">Medical notes</Label><Textarea id="medicalNotes" name="medicalNotes" maxLength={2000} rows={2} className="mt-1" /></div>
    <div><Label htmlFor="personalDetails">Personal details</Label><Textarea id="personalDetails" name="personalDetails" maxLength={2000} rows={2} className="mt-1" /></div>
    <div className="md:col-span-2"><ActionFeedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Save sensitive details"}</Button></div>
  </form>;
}

export function InspectionForm({ workers, today }: { workers: Option[]; today: string }) {
  const [state, action, pending] = useActionState(createInspection, {} as SafetyState);
  return <form action={action} className="grid gap-4 md:grid-cols-3">
    <div className="md:col-span-2"><Label htmlFor="inspection-title">Inspection *</Label><Input id="inspection-title" name="title" required maxLength={160} placeholder="Weekly plant walkaround" className="mt-1" /></div>
    <div><Label htmlFor="inspectedOn">Date *</Label><Input id="inspectedOn" name="inspectedOn" type="date" required defaultValue={today} className="mt-1" /></div>
    <div><Label htmlFor="area">Area</Label><Input id="area" name="area" maxLength={160} className="mt-1" /></div>
    <Select name="inspectorWorkerId" label="Inspector" options={workers} placeholder="Not recorded" />
    <Select name="isSatisfactory" label="Outcome" placeholder="Not assessed" options={[{ id: "yes", label: "Satisfactory" }, { id: "no", label: "Not satisfactory" }]} />
    <div className="md:col-span-3"><Label htmlFor="findings">Findings</Label><Textarea id="findings" name="findings" maxLength={4000} rows={2} className="mt-1" /></div>
    <div className="md:col-span-3"><ActionFeedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Record inspection"}</Button></div>
  </form>;
}

export function CorrectiveActionForm({ incidents, inspections, workers }: { incidents: Option[]; inspections: Option[]; workers: Option[] }) {
  const [state, action, pending] = useActionState(createCorrectiveAction, {} as SafetyState);
  return <form action={action} className="grid gap-4 md:grid-cols-3">
    <div className="md:col-span-3"><Label htmlFor="description">Action *</Label><Input id="description" name="description" required maxLength={300} placeholder="Install edge protection on bench 4" className="mt-1" /></div>
    <Select name="incidentId" label="From incident" options={incidents} placeholder="Not from an incident" />
    <Select name="inspectionId" label="From inspection" options={inspections} placeholder="Not from an inspection" />
    <Select name="assignedWorkerId" label="Assigned to" options={workers} placeholder="Unassigned" />
    <div><Label htmlFor="dueOn">Due on</Label><Input id="dueOn" name="dueOn" type="date" className="mt-1" /></div>
    <div className="md:col-span-3"><ActionFeedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Raise action"}</Button></div>
  </form>;
}

export function CorrectiveActionStatusForm({ actionId, status, actionTitle }: { actionId: string; status: string; actionTitle: string }) {
  const [state, action, pending] = useActionState(updateCorrectiveAction, {} as SafetyState);
  return <form action={action} className="flex flex-wrap items-end gap-2">
    <input name="actionId" type="hidden" value={actionId} />
    <select name="status" defaultValue={status} aria-label={`Status for ${actionTitle}`} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
      {correctiveActionStatuses.map((value) => <option key={value} value={value}>{actionStatusLabels[value]}</option>)}
    </select>
    <Button disabled={pending} size="sm" variant="outline">{pending ? "Saving…" : "Update"}</Button>
    <div className="w-full"><ActionFeedback state={state} /></div>
  </form>;
}
