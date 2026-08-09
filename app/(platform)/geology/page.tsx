import {redirect} from "next/navigation";
import {FlaskConical,MapPinned} from "lucide-react";
import {Alert,EmptyState,PageHeader,StatCard} from "@/components/ui/feedback";
import {Panel} from "@/components/ui/card";
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from "@/components/ui/table";
import {hasPermission} from "@/lib/auth/permissions";import {getActiveWorkspace} from "@/lib/auth/workspace";
import {getLocale} from "@/lib/i18n/locale";import {t} from "@/lib/i18n/messages";
import {AssayForm,BoundaryForm,DrillHoleForm,DrillIntervalForm,SampleForm} from "@/features/geology/geology-forms";
import {ExplorationPlot} from "@/features/geology/exploration-plot";
import {DocumentPanel} from "@/features/documents/document-panel";import {DocumentUploadForm} from "@/features/documents/document-upload-form";import {documentsEnabled} from "@/lib/features";

export default async function GeologyPage(){
  const[w,locale]=await Promise.all([getActiveWorkspace(),getLocale()]);const org=w.activeOrganization,site=w.activeSite;
  if(!org||!site||!await hasPermission(org.id,"geology.read"))redirect("/dashboard");
  const[canCreate,canUpdate]=await Promise.all([hasPermission(org.id,"geology.create"),hasPermission(org.id,"geology.update")]);
  const[samplesResult,assaysResult,holesResult,intervalsResult,boundariesResult,licencesResult,filesResult]=await Promise.all([
    w.supabase.from("geological_samples").select("id,sample_code,sample_type,collected_on,latitude,longitude,material").eq("organization_id",org.id).eq("mine_site_id",site.id).order("collected_on",{ascending:false}).limit(100),
    w.supabase.from("geological_assays").select("id,sample_id,analyte,value_ppm,method,laboratory,tested_on").eq("organization_id",org.id).eq("mine_site_id",site.id).order("tested_on",{ascending:false}).limit(100),
    w.supabase.from("drill_holes").select("id,hole_code,latitude,longitude,status,planned_depth_m,actual_depth_m").eq("organization_id",org.id).eq("mine_site_id",site.id).order("created_at",{ascending:false}).limit(100),
    w.supabase.from("drill_intervals").select("id,drill_hole_id,from_depth_m,to_depth_m,lithology,grade_ppm").eq("organization_id",org.id).eq("mine_site_id",site.id).order("from_depth_m").limit(250),
    w.supabase.from("geological_boundaries").select("id,name,boundary_geojson,source,recorded_on,licence_id").eq("organization_id",org.id).eq("mine_site_id",site.id).order("recorded_on",{ascending:false}).limit(50),
    w.supabase.from("mineral_licences").select("id,licence_number").eq("organization_id",org.id).or(`mine_site_id.is.null,mine_site_id.eq.${site.id}`).is("deleted_at",null).limit(100),
    w.supabase.from("geological_files").select("id,document_name,document_path").eq("organization_id",org.id).eq("mine_site_id",site.id).order("created_at",{ascending:false}),
  ]);
  const samples=samplesResult.data??[],assays=assaysResult.data??[],holes=holesResult.data??[],intervals=intervalsResult.data??[],boundaries=boundariesResult.data??[];
  const assayBySample=new Map(assays.map(a=>[a.sample_id,a]));const intervalsByHole=new Map<string,typeof intervals>();for(const row of intervals)intervalsByHole.set(row.drill_hole_id,[...(intervalsByHole.get(row.drill_hole_id)??[]),row]);
  const points=[...samples.map(s=>({id:s.id,code:s.sample_code,latitude:s.latitude,longitude:s.longitude,kind:"sample" as const,grade:assayBySample.get(s.id)?.value_ppm})),...holes.map(h=>({id:h.id,code:h.hole_code,latitude:h.latitude,longitude:h.longitude,kind:"drill" as const,grade:Math.max(...(intervalsByHole.get(h.id)??[]).map(x=>Number(x.grade_ppm??0)))||null}))];
  const graded=[...assays.map(a=>Number(a.value_ppm)),...intervals.map(i=>Number(i.grade_ppm))].filter(Number.isFinite);const highest=graded.length?Math.max(...graded):null;
  const today=new Date().toISOString().slice(0,10);
  return <div className="space-y-6">
    <PageHeader eyebrow={t(locale,"recordedEvidence")} title={t(locale,"geologyTitle")} description={t(locale,"geologyDescription",{site:site.name})}/><Alert variant="warning">{t(locale,"geoEvidenceWarning")}</Alert>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><StatCard label={t(locale,"samples")} value={samples.length}/><StatCard label={t(locale,"assays")} value={assays.length}/><StatCard label={t(locale,"drillHoles")} value={holes.length}/><StatCard label={t(locale,"licenceBoundaries")} value={boundaries.length}/></div>
    <Panel title={t(locale,"explorationMap")} description={t(locale,"explorationPlotDescription")}><ExplorationPlot points={points} boundaries={boundaries.map(b=>({id:b.id,name:b.name,geojson:b.boundary_geojson as {type?:string;coordinates?:unknown}}))} labels={{empty:t(locale,"noMapPoints"),sample:t(locale,"samplePoint"),drill:t(locale,"drillPoint"),boundary:t(locale,"licenceBoundary")}}/></Panel>
    <Panel title={t(locale,"geoAiTitle")} description={t(locale,"geoAiDescription")}><div className="grid gap-3 sm:grid-cols-2">
      <Alert variant="info">{highest===null?t(locale,"geoAiNoGrades"):t(locale,"geoAiHighestGrade",{grade:highest.toLocaleString(undefined,{maximumFractionDigits:6}),count:String(graded.length)})}</Alert>
      <Alert variant={holes.length&&!intervals.length?"warning":"info"}>{holes.length&&!intervals.length?t(locale,"geoAiMissingIntervals"):t(locale,"geoAiCoverage",{holes:String(holes.length),intervals:String(intervals.length),boundaries:String(boundaries.length)})}</Alert>
    </div><p className="mt-3 text-xs text-muted-foreground">{t(locale,"geoAiEvidenceSources")}</p></Panel>
    <Panel title={t(locale,"samples")}>{canCreate&&<div className="mb-5 border-b pb-5"><SampleForm today={today}/></div>}{samples.length?<Table><TableHeader><TableRow><TableHead>{t(locale,"sampleCode")}</TableHead><TableHead>{t(locale,"sampleType")}</TableHead><TableHead>{t(locale,"collectedOn")}</TableHead><TableHead>{t(locale,"assayPpm")}</TableHead></TableRow></TableHeader><TableBody>{samples.map(s=><TableRow key={s.id}><TableCell className="font-medium">{s.sample_code}</TableCell><TableCell>{s.sample_type}</TableCell><TableCell>{s.collected_on}</TableCell><TableCell>{assayBySample.get(s.id)?.value_ppm??"—"}</TableCell></TableRow>)}</TableBody></Table>:<EmptyState icon={<FlaskConical/>} title={t(locale,"noSamples")}/>}</Panel>
    <Panel title={t(locale,"assays")}>{canCreate&&samples.length>0&&<AssayForm samples={samples.map(s=>({id:s.id,sample_code:s.sample_code}))} today={today}/>}</Panel>
    <Panel title={t(locale,"drillHoles")}>{canCreate&&<div className="mb-5 border-b pb-5"><DrillHoleForm/></div>}{holes.length?<Table><TableHeader><TableRow><TableHead>{t(locale,"holeCode")}</TableHead><TableHead>{t(locale,"fStatus")}</TableHead><TableHead>{t(locale,"latitude")}</TableHead><TableHead>{t(locale,"longitude")}</TableHead></TableRow></TableHeader><TableBody>{holes.map(h=><TableRow key={h.id}><TableCell className="font-medium">{h.hole_code}</TableCell><TableCell>{h.status}</TableCell><TableCell>{h.latitude}</TableCell><TableCell>{h.longitude}</TableCell></TableRow>)}</TableBody></Table>:<EmptyState icon={<MapPinned/>} title={t(locale,"noDrillHoles")}/>}</Panel>
    <Panel title={t(locale,"drillIntervals")}>{canCreate&&holes.length>0&&<div className="mb-5 border-b pb-5"><DrillIntervalForm holes={holes.map(h=>({id:h.id,hole_code:h.hole_code}))}/></div>}{intervals.length?<Table><TableHeader><TableRow><TableHead>{t(locale,"drillHole")}</TableHead><TableHead>{t(locale,"depthInterval")}</TableHead><TableHead>{t(locale,"lithology")}</TableHead><TableHead>{t(locale,"assayPpm")}</TableHead></TableRow></TableHeader><TableBody>{intervals.map(i=><TableRow key={i.id}><TableCell>{holes.find(h=>h.id===i.drill_hole_id)?.hole_code??"—"}</TableCell><TableCell>{i.from_depth_m}–{i.to_depth_m} m</TableCell><TableCell>{i.lithology??"—"}</TableCell><TableCell>{i.grade_ppm??"—"}</TableCell></TableRow>)}</TableBody></Table>:<EmptyState title={t(locale,"noDrillIntervals")}/>}</Panel>
    <Panel title={t(locale,"licenceBoundaries")}>{canCreate&&<div className="mb-5 border-b pb-5"><BoundaryForm licences={licencesResult.data??[]} today={today}/></div>}{boundaries.length?<Table><TableHeader><TableRow><TableHead>{t(locale,"boundaryName")}</TableHead><TableHead>{t(locale,"fDate")}</TableHead><TableHead>{t(locale,"boundarySource")}</TableHead></TableRow></TableHeader><TableBody>{boundaries.map(b=><TableRow key={b.id}><TableCell>{b.name}</TableCell><TableCell>{b.recorded_on}</TableCell><TableCell>{b.source??"—"}</TableCell></TableRow>)}</TableBody></Table>:<EmptyState title={t(locale,"noBoundaries")}/>}</Panel>
    {documentsEnabled()&&<><DocumentPanel title={t(locale,"geologicalFiles")} scope="geology" documents={filesResult.data??[]}/>{canUpdate&&<Panel title={t(locale,"attachGeologicalFile")}><DocumentUploadForm scope="geology" ownerId={site.id}/></Panel>}</>}
  </div>;
}
