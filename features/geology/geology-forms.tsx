"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ActionFeedback } from "@/components/ui/feedback";
import { fieldClass, selectClass } from "@/components/ui/form";
import { useT } from "@/lib/i18n/client";
import { createAssay, createDrillHole, createDrillInterval, createGeologicalBoundary, createSample, type GeologyState } from "./actions";

export function SampleForm({ today }: { today:string }) { const tr=useT(); const [state,action,pending]=useActionState(createSample,{} as GeologyState); return <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
  <label className="text-sm font-semibold">{tr("sampleCode")} *<input required name="sampleCode" className={fieldClass}/></label><label className="text-sm font-semibold">{tr("sampleType")}<select name="sampleType" className={selectClass}>{["rock","soil","channel","chip","core","other"].map(x=><option key={x}>{x}</option>)}</select></label><label className="text-sm font-semibold">{tr("collectedOn")}<input required type="date" name="collectedOn" defaultValue={today} className={fieldClass}/></label>
  <label className="text-sm font-semibold">{tr("latitude")}<input required type="number" step="0.000001" min="-90" max="90" name="latitude" className={fieldClass}/></label><label className="text-sm font-semibold">{tr("longitude")}<input required type="number" step="0.000001" min="-180" max="180" name="longitude" className={fieldClass}/></label><label className="text-sm font-semibold">{tr("fMaterial")}<input name="material" className={fieldClass}/></label><div className="lg:col-span-3"><ActionFeedback state={state}/><Button disabled={pending} className="mt-3">{pending?tr("saving"):tr("addSample")}</Button></div>
  </form>; }
export function AssayForm({ samples, today }:{samples:Array<{id:string;sample_code:string}>;today:string}) { const tr=useT(); const [state,action,pending]=useActionState(createAssay,{} as GeologyState); return <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
  <label className="text-sm font-semibold">{tr("sample")}<select required name="sampleId" className={selectClass}>{samples.map(s=><option key={s.id} value={s.id}>{s.sample_code}</option>)}</select></label><label className="text-sm font-semibold">{tr("analyte")}<input required name="analyte" defaultValue="Au" className={fieldClass}/></label><label className="text-sm font-semibold">{tr("assayPpm")}<input required type="number" min="0" step="0.000001" name="valuePpm" className={fieldClass}/></label><label className="text-sm font-semibold">{tr("assayMethod")}<input name="method" className={fieldClass}/></label><label className="text-sm font-semibold">{tr("laboratory")}<input name="laboratory" className={fieldClass}/></label><label className="text-sm font-semibold">{tr("testedOn")}<input type="date" name="testedOn" defaultValue={today} className={fieldClass}/></label><div className="lg:col-span-3"><ActionFeedback state={state}/><Button disabled={pending} className="mt-3">{pending?tr("saving"):tr("addAssay")}</Button></div>
  </form>; }
export function DrillHoleForm() { const tr=useT(); const [state,action,pending]=useActionState(createDrillHole,{} as GeologyState); return <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
  <label className="text-sm font-semibold">{tr("holeCode")} *<input required name="holeCode" className={fieldClass}/></label><label className="text-sm font-semibold">{tr("latitude")}<input required type="number" step="0.000001" min="-90" max="90" name="latitude" className={fieldClass}/></label><label className="text-sm font-semibold">{tr("longitude")}<input required type="number" step="0.000001" min="-180" max="180" name="longitude" className={fieldClass}/></label><label className="text-sm font-semibold">{tr("azimuth")}<input type="number" min="0" max="360" step="0.01" name="azimuth" className={fieldClass}/></label><label className="text-sm font-semibold">{tr("dip")}<input type="number" min="-90" max="90" step="0.01" name="dip" className={fieldClass}/></label><label className="text-sm font-semibold">{tr("plannedDepth")}<input type="number" min="0" step="0.01" name="plannedDepth" className={fieldClass}/></label><label className="text-sm font-semibold">{tr("fStatus")}<select name="status" className={selectClass}>{["planned","drilling","completed","abandoned"].map(x=><option key={x}>{x}</option>)}</select></label><div className="lg:col-span-3"><ActionFeedback state={state}/><Button disabled={pending} className="mt-3">{pending?tr("saving"):tr("addDrillHole")}</Button></div>
  </form>; }

export function DrillIntervalForm({holes}:{holes:Array<{id:string;hole_code:string}>}){const tr=useT();const[state,action,pending]=useActionState(createDrillInterval,{} as GeologyState);return <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
  <label className="text-sm font-semibold">{tr("drillHole")}<select required name="drillHoleId" className={selectClass}>{holes.map(h=><option key={h.id} value={h.id}>{h.hole_code}</option>)}</select></label>
  <label className="text-sm font-semibold">{tr("fromDepth")}<input required type="number" min="0" step="0.01" name="fromDepth" className={fieldClass}/></label>
  <label className="text-sm font-semibold">{tr("toDepth")}<input required type="number" min="0.01" step="0.01" name="toDepth" className={fieldClass}/></label>
  <label className="text-sm font-semibold">{tr("lithology")}<input name="lithology" maxLength={160} className={fieldClass}/></label>
  <label className="text-sm font-semibold">{tr("assayPpm")}<input type="number" min="0" step="0.000001" name="gradePpm" className={fieldClass}/></label>
  <label className="text-sm font-semibold">{tr("fNotes")}<input name="notes" maxLength={2000} className={fieldClass}/></label>
  <div className="lg:col-span-3"><ActionFeedback state={state}/><Button disabled={pending} className="mt-3">{pending?tr("saving"):tr("addDrillInterval")}</Button></div>
</form>}

export function BoundaryForm({licences,today}:{licences:Array<{id:string;licence_number:string}>;today:string}){const tr=useT();const[state,action,pending]=useActionState(createGeologicalBoundary,{} as GeologyState);return <form action={action} className="grid gap-3 sm:grid-cols-2">
  <label className="text-sm font-semibold">{tr("boundaryName")}<input required name="name" maxLength={160} className={fieldClass}/></label>
  <label className="text-sm font-semibold">{tr("fLicence")}<select name="licenceId" className={selectClass}><option value="">{tr("optNotLinked")}</option>{licences.map(x=><option key={x.id} value={x.id}>{x.licence_number}</option>)}</select></label>
  <label className="text-sm font-semibold">{tr("boundarySource")}<input name="source" maxLength={240} className={fieldClass}/></label>
  <label className="text-sm font-semibold">{tr("fDate")}<input required type="date" name="recordedOn" defaultValue={today} className={fieldClass}/></label>
  <label className="text-sm font-semibold sm:col-span-2">{tr("boundaryGeojson")}<textarea required name="boundaryGeojson" rows={5} className={fieldClass} placeholder='{"type":"Polygon","coordinates":[[[39.1,-6.8],[39.2,-6.8],[39.2,-6.7],[39.1,-6.8]]]}'/></label>
  <label className="text-sm font-semibold sm:col-span-2">{tr("fNotes")}<textarea name="notes" rows={2} maxLength={2000} className={fieldClass}/></label>
  <div className="sm:col-span-2"><ActionFeedback state={state}/><Button disabled={pending} className="mt-3">{pending?tr("saving"):tr("addBoundary")}</Button></div>
</form>}
