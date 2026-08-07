"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { fieldClass, selectClass } from "@/components/ui/form";
import {
  addMaintenanceCost,
  addMaintenancePart,
  completeWorkOrder,
  createMaintenanceRequest,
  createMaintenanceSchedule,
  createWorkOrder,
  updateWorkOrderStatus,
  type MaintenanceState,
} from "./actions";
import { costTypeLabels, costTypes, maintenancePriorities, priorityLabels } from "./schemas";


export type Option = { id: string; label: string };

function Feedback({ state }: { state: MaintenanceState }) {
  if (state.error) return <p role="alert" className="rounded-lg bg-destructive/12 p-3 text-sm text-destructive">{state.error}</p>;
  if (state.success) return <p role="status" className="rounded-lg bg-success/12 p-3 text-sm text-primary">{state.success}</p>;
  return null;
}

function OptionSelect({ name, label, options, placeholder, required }: { name: string; label: string; options: Option[]; placeholder: string; required?: boolean }) {
  return <label className="text-sm font-semibold">{label}{required ? " *" : ""}
    <select required={required} name={name} defaultValue="" className={selectClass}>
      <option value="">{placeholder}</option>
      {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
  </label>;
}

function PrioritySelect() {
  return <label className="text-sm font-semibold">Priority *
    <select required name="priority" defaultValue="medium" className={selectClass}>
      {maintenancePriorities.map((value) => <option key={value} value={value}>{priorityLabels[value]}</option>)}
    </select>
  </label>;
}

export function MaintenanceRequestForm({ equipment, workers, today }: { equipment: Option[]; workers: Option[]; today: string }) {
  const [state, action, pending] = useActionState(createMaintenanceRequest, {} as MaintenanceState);
  return <form action={action} className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-3">
    <div className="md:col-span-3"><h2 className="text-lg font-bold">Raise a request</h2><p className="mt-1 text-sm text-muted-foreground">Report a fault or a job that needs planning.</p></div>
    <label className="text-sm font-semibold md:col-span-2">Title *<input required name="title" maxLength={160} placeholder="Hydraulic leak on boom" className={fieldClass} /></label>
    <PrioritySelect />
    <OptionSelect name="equipmentId" label="Equipment" options={equipment} placeholder="Not equipment specific" />
    <OptionSelect name="reportedByWorkerId" label="Reported by" options={workers} placeholder="Not recorded" />
    <label className="text-sm font-semibold">Reported on *<input required name="reportedOn" type="date" defaultValue={today} className={fieldClass} /></label>
    <label className="text-sm font-semibold md:col-span-3">Description<textarea name="description" maxLength={2000} rows={2} className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div className="md:col-span-3"><Button disabled={pending}>{pending ? "Saving…" : "Raise request"}</Button></div>
  </form>;
}

export function WorkOrderForm({ equipment, workers, requests }: { equipment: Option[]; workers: Option[]; requests: Option[] }) {
  const [state, action, pending] = useActionState(createWorkOrder, {} as MaintenanceState);
  return <form action={action} className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-3">
    <div className="md:col-span-3"><h2 className="text-lg font-bold">Create a work order</h2><p className="mt-1 text-sm text-muted-foreground">Work orders start as planned and move through the lifecycle.</p></div>
    <label className="text-sm font-semibold md:col-span-2">Title *<input required name="title" maxLength={160} placeholder="500 hour service" className={fieldClass} /></label>
    <PrioritySelect />
    <OptionSelect name="equipmentId" label="Equipment" options={equipment} placeholder="Not equipment specific" />
    <OptionSelect name="assignedWorkerId" label="Assigned to" options={workers} placeholder="Unassigned" />
    <label className="text-sm font-semibold">Scheduled for<input name="scheduledFor" type="date" className={fieldClass} /></label>
    <OptionSelect name="requestId" label="From request" options={requests} placeholder="Not from a request" />
    <label className="text-sm font-semibold md:col-span-2">Description<input name="description" maxLength={2000} className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div className="md:col-span-3"><Button disabled={pending}>{pending ? "Saving…" : "Create work order"}</Button></div>
  </form>;
}

export function WorkOrderStatusForm({ workOrderId, allowed }: { workOrderId: string; allowed: string[] }) {
  const [state, action, pending] = useActionState(updateWorkOrderStatus, {} as MaintenanceState);
  if (!allowed.length) return null;
  return <form action={action} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
    <input name="workOrderId" type="hidden" value={workOrderId} />
    <label className="text-sm font-semibold">Move to
      <select name="status" defaultValue={allowed[0]} className={selectClass}>
        {allowed.map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}
      </select>
    </label>
    <Button disabled={pending}>{pending ? "Saving…" : "Update status"}</Button>
    <div className="sm:col-span-2"><Feedback state={state} /></div>
  </form>;
}

export function CompleteWorkOrderForm({ workOrderId }: { workOrderId: string }) {
  const [state, action, pending] = useActionState(completeWorkOrder, {} as MaintenanceState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <input name="workOrderId" type="hidden" value={workOrderId} />
    <label className="text-sm font-semibold">Meter at service<input name="meterAtService" type="number" min="0" step="0.01" className={fieldClass} /></label>
    <label className="text-sm font-semibold md:col-span-2">Completion notes<input name="notes" maxLength={2000} className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Completing…" : "Complete work order"}</Button></div>
  </form>;
}

export function MaintenancePartForm({ workOrderId }: { workOrderId: string }) {
  const [state, action, pending] = useActionState(addMaintenancePart, {} as MaintenanceState);
  return <form action={action} className="grid gap-3 md:grid-cols-4">
    <input name="workOrderId" type="hidden" value={workOrderId} />
    <label className="text-sm font-semibold md:col-span-2">Part *<input required name="partName" maxLength={160} placeholder="Hydraulic hose" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Quantity *<input required name="quantity" type="number" min="0.001" step="0.001" defaultValue="1" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Unit cost<input name="unitCost" type="number" min="0" step="0.0001" className={fieldClass} /></label>
    <div className="md:col-span-4"><Feedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Add part"}</Button></div>
  </form>;
}

export function MaintenanceCostForm({ workOrderId, today }: { workOrderId: string; today: string }) {
  const [state, action, pending] = useActionState(addMaintenanceCost, {} as MaintenanceState);
  return <form action={action} className="grid gap-3 md:grid-cols-4">
    <input name="workOrderId" type="hidden" value={workOrderId} />
    <label className="text-sm font-semibold">Type *
      <select required name="costType" defaultValue="parts" className={selectClass}>{costTypes.map((value) => <option key={value} value={value}>{costTypeLabels[value]}</option>)}</select>
    </label>
    <label className="text-sm font-semibold">Amount *<input required name="amount" type="number" min="0" step="0.01" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Incurred on *<input required name="incurredOn" type="date" defaultValue={today} className={fieldClass} /></label>
    <label className="text-sm font-semibold">Description<input name="description" maxLength={500} className={fieldClass} /></label>
    <div className="md:col-span-4"><Feedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Add cost"}</Button></div>
  </form>;
}

export function MaintenanceScheduleForm({ equipment }: { equipment: Option[] }) {
  const [state, action, pending] = useActionState(createMaintenanceSchedule, {} as MaintenanceState);
  return <form action={action} className="grid gap-3 md:grid-cols-3">
    <OptionSelect name="equipmentId" label="Equipment" options={equipment} placeholder="Select equipment" required />
    <label className="text-sm font-semibold md:col-span-2">Schedule name *<input required name="name" maxLength={160} placeholder="250 hour service" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Every (meter)<input name="intervalMeter" type="number" min="0" step="0.01" placeholder="250" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Every (days)<input name="intervalDays" type="number" min="1" step="1" placeholder="90" className={fieldClass} /></label>
    <label className="text-sm font-semibold">Next due on<input name="nextDueOn" type="date" className={fieldClass} /></label>
    <div className="md:col-span-3"><Feedback state={state} /></div>
    <div><Button disabled={pending}>{pending ? "Saving…" : "Add schedule"}</Button></div>
  </form>;
}
