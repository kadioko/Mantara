"use client";

import { useActionState, useRef } from "react";
import { useT } from "@/lib/i18n/client";
import { useEncryptedDraft } from "@/lib/offline/encrypted-drafts";
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
  const tr = useT();
  const [state, action, pending] = useActionState(createIncident, {} as SafetyState);
  return <form action={action} className="grid gap-4 md:grid-cols-3">
    <div className="md:col-span-2"><Label htmlFor="title">{tr("whatHappenedRequired")}</Label><Input id="title" name="title" required maxLength={160} placeholder={tr("incidentTitleExample")} className="mt-1" /></div>
    <div><Label htmlFor="reference">{tr("reference")}</Label><Input id="reference" name="reference" maxLength={80} className="mt-1" /></div>
    <Select name="category" label={tr("fCategory")} required defaultValue="other" options={incidentCategories.map((value) => ({ id: value, label: categoryLabels[value] }))} />
    <Select name="severity" label={tr("fSeverity")} required defaultValue="low" options={incidentSeverities.map((value) => ({ id: value, label: severityLabels[value] }))} />
    <div><Label htmlFor="location">{tr("fLocation")}</Label><Input id="location" name="location" maxLength={160} placeholder={tr("locationExample")} className="mt-1" /></div>
    <div><Label htmlFor="occurredOn">{tr("dateRequired")}</Label><Input id="occurredOn" name="occurredOn" type="date" required defaultValue={today} className="mt-1" /></div>
    <div><Label htmlFor="occurredTime">Time</Label><Input id="occurredTime" name="occurredTime" type="time" className="mt-1" /></div>
    <div><Label htmlFor="peopleInvolved">{tr("peopleInvolved")}</Label><Input id="peopleInvolved" name="peopleInvolved" type="number" min="0" step="1" className="mt-1" /></div>
    <Select name="reportedByWorkerId" label={tr("reportedBy")} options={workers} placeholder={tr("optNotRecorded")} />
    <Select name="equipmentId" label={tr("equipmentInvolved")} options={equipment} placeholder={tr("optNone")} />
    <div><Label htmlFor="lostTimeHours">{tr("lostTimeHours")}</Label><Input id="lostTimeHours" name="lostTimeHours" type="number" min="0" step="0.5" className="mt-1" /></div>
    <div className="md:col-span-3">
      <Label htmlFor="summary">{tr("fSummary")}</Label>
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
  const tr = useT();
  const [state, action, pending] = useActionState(updateIncidentStatus, {} as SafetyState);
  return <form action={action} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
    <input name="incidentId" type="hidden" value={incidentId} />
    <Select name="status" label={tr("fStatus")} defaultValue={status} options={incidentStatuses.map((value) => ({ id: value, label: statusLabels[value] }))} />
    <Button disabled={pending}>{pending ? "Saving…" : "Update"}</Button>
    <div className="sm:col-span-2"><ActionFeedback state={state} /></div>
  </form>;
}

/**
 * Sensitive details are never rendered on page load. The reader asks for them explicitly, which makes
 * the audit entry correspond to a real intent to view rather than an incidental page visit.
 */
export function SensitiveDetailsPanel({ incidentId, hasDetails, canRead }: { incidentId: string; hasDetails: boolean; canRead: boolean }) {
  const tr = useT();
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
      <div><dt className="text-sm text-muted-foreground">{tr("injury")}</dt><dd className="mt-0.5">{state.details?.injury_description || "—"}</dd></div>
      <div><dt className="text-sm text-muted-foreground">{tr("medicalNotes")}</dt><dd className="mt-0.5">{state.details?.medical_notes || "—"}</dd></div>
      <div className="sm:col-span-2"><dt className="text-sm text-muted-foreground">{tr("personalDetails")}</dt><dd className="mt-0.5">{state.details?.personal_details || "—"}</dd></div>
    </dl>
  </div>;
}

export function SensitiveDetailsForm({ incidentId, workers }: { incidentId: string; workers: Option[] }) {
  const tr = useT();
  const [state, action, pending] = useActionState(saveIncidentDetails, {} as SafetyState);
  return <form action={action} className="grid gap-4 md:grid-cols-2">
    <input name="incidentId" type="hidden" value={incidentId} />
    <Select name="injuredWorkerId" label={tr("injuredPerson")} options={workers} placeholder={tr("optNotRecorded")} />
    <div><Label htmlFor="injuryDescription">{tr("injury")}</Label><Input id="injuryDescription" name="injuryDescription" maxLength={2000} className="mt-1" /></div>
    <div><Label htmlFor="medicalNotes">{tr("medicalNotes")}</Label><Textarea id="medicalNotes" name="medicalNotes" maxLength={2000} rows={2} className="mt-1" /></div>
    <div><Label htmlFor="personalDetails">{tr("personalDetails")}</Label><Textarea id="personalDetails" name="personalDetails" maxLength={2000} rows={2} className="mt-1" /></div>
    <div className="md:col-span-2"><ActionFeedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Save sensitive details"}</Button></div>
  </form>;
}

export function InspectionForm({ workers, today }: { workers: Option[]; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(createInspection, {} as SafetyState);
  const formRef = useRef<HTMLFormElement>(null);
  const draftStatus = useEncryptedDraft(formRef, `safety-inspection-${today}`, Boolean(state.success));
  return <form ref={formRef} action={action} className="grid gap-4 md:grid-cols-3">
    <div className="md:col-span-2"><Label htmlFor="inspection-title">{tr("inspection")} *</Label><Input id="inspection-title" name="title" required maxLength={160} placeholder={tr("inspectionPlaceholder")} className="mt-1" /></div>
    <div><Label htmlFor="inspectedOn">{tr("fDate")} *</Label><Input id="inspectedOn" name="inspectedOn" type="date" required defaultValue={today} className="mt-1" /></div>
    <div><Label htmlFor="area">{tr("area")}</Label><Input id="area" name="area" maxLength={160} className="mt-1" /></div>
    <Select name="inspectorWorkerId" label={tr("inspector")} options={workers} placeholder={tr("optNotRecorded")} />
    <Select name="isSatisfactory" label={tr("outcome")} placeholder={tr("notAssessed")} options={[{ id: "yes", label: tr("satisfactory") }, { id: "no", label: tr("notSatisfactory") }]} />
    <div className="md:col-span-3"><Label htmlFor="findings">{tr("findings")}</Label><Textarea id="findings" name="findings" maxLength={4000} rows={2} className="mt-1" /></div>
    <div className="md:col-span-3"><ActionFeedback state={state} />{draftStatus!=="idle"&&<p role="status" className="mt-2 text-xs text-muted-foreground">{tr(draftStatus==="restored"?"offlineDraftRestored":"offlineDraftSaved")}</p>}</div>
    <div><Button disabled={pending}>{pending ? tr("saving") : tr("recordInspection")}</Button></div>
  </form>;
}

export function CorrectiveActionForm({ incidents, inspections, workers }: { incidents: Option[]; inspections: Option[]; workers: Option[] }) {
  const tr = useT();
  const [state, action, pending] = useActionState(createCorrectiveAction, {} as SafetyState);
  return <form action={action} className="grid gap-4 md:grid-cols-3">
    <div className="md:col-span-3"><Label htmlFor="description">{tr("actionRequired")}</Label><Input id="description" name="description" required maxLength={300} placeholder={tr("correctiveActionExample")} className="mt-1" /></div>
    <Select name="incidentId" label={tr("fromIncident")} options={incidents} placeholder={tr("notFromIncident")} />
    <Select name="inspectionId" label={tr("fromInspection")} options={inspections} placeholder={tr("notFromInspection")} />
    <Select name="assignedWorkerId" label={tr("fAssignedTo")} options={workers} placeholder={tr("optUnassigned")} />
    <div><Label htmlFor="dueOn">{tr("fDueOn")}</Label><Input id="dueOn" name="dueOn" type="date" className="mt-1" /></div>
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
