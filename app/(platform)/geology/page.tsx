import {redirect} from "next/navigation";
import {FlaskConical,MapPinned} from "lucide-react";
import {Alert,EmptyState,PageHeader,StatCard} from "@/components/ui/feedback";
import {Panel} from "@/components/ui/card";
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from "@/components/ui/table";
import {hasPermission} from "@/lib/auth/permissions";import {getActiveWorkspace} from "@/lib/auth/workspace";
import {getLocale} from "@/lib/i18n/locale";import {t} from "@/lib/i18n/messages";
import {AssayForm,BoundaryForm,DrillHoleForm,DrillIntervalForm,SampleForm} from "@/features/geology/geology-forms";
import {highestGrade,holeGrade,intervalsByHole,latestAssayBySample} from "@/features/geology/derive";
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

  /*
    The stat cards count in the database, not in JavaScript.

    The tables above are read a page at a time — 100 samples, 250 intervals — and the cards used to
    show the length of those pages. A site with 5,000 samples read "100", which is not a rounding
    error but a different number presented with equal confidence. Every other module page already
    counts with `count: "exact", head: true`; geology was the one that did not.
  */
  const [sampleCount,assayCount,holeCount,boundaryCount]=await Promise.all([
    w.supabase.from("geological_samples").select("id",{count:"exact",head:true}).eq("organization_id",org.id).eq("mine_site_id",site.id),
    w.supabase.from("geological_assays").select("id",{count:"exact",head:true}).eq("organization_id",org.id).eq("mine_site_id",site.id),
    w.supabase.from("drill_holes").select("id",{count:"exact",head:true}).eq("organization_id",org.id).eq("mine_site_id",site.id),
    w.supabase.from("geological_boundaries").select("id",{count:"exact",head:true}).eq("organization_id",org.id).eq("mine_site_id",site.id),
  ]);
  // A dash, never a zero. "0 samples" is a claim about the site; a failed count is a claim about us.
  const total=(result:{count:number|null;error:unknown})=>result.error?"—":(result.count??0);
  const samples=samplesResult.data??[],assays=assaysResult.data??[],holes=holesResult.data??[],intervals=intervalsResult.data??[],boundaries=boundariesResult.data??[];
  // Worked out in features/geology/derive.ts, where tests can reach it. Three of these were wrong
  // while they lived here as one-line expressions inside the markup.
  const assayBySample=latestAssayBySample(assays);const byHole=intervalsByHole(intervals);
  const points=[...samples.map(s=>({id:s.id,code:s.sample_code,latitude:s.latitude,longitude:s.longitude,kind:"sample" as const,grade:assayBySample.get(s.id)?.value_ppm??null})),...holes.map(h=>({id:h.id,code:h.hole_code,latitude:h.latitude,longitude:h.longitude,kind:"drill" as const,grade:holeGrade(byHole.get(h.id)??[])}))];
  const {grade:highest,sampled:gradedCount}=highestGrade(assays,intervals);
  const today=new Date().toISOString().slice(0,10);
  return <div className="space-y-6">
    <PageHeader eyebrow={t(locale,"recordedEvidence")} title={t(locale,"geologyTitle")} description={t(locale,"geologyDescription",{site:site.name})}/><Alert variant="warning">{t(locale,"geoEvidenceWarning")}</Alert>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><StatCard label={t(locale,"samples")} value={total(sampleCount)}/><StatCard label={t(locale,"assays")} value={total(assayCount)}/><StatCard label={t(locale,"drillHoles")} value={total(holeCount)}/><StatCard label={t(locale,"licenceBoundaries")} value={total(boundaryCount)}/></div>
    <Panel title={t(locale,"explorationMap")} description={t(locale,"explorationPlotDescription")}><ExplorationPlot points={points} boundaries={boundaries.map(b=>({id:b.id,name:b.name,geojson:b.boundary_geojson as {type?:string;coordinates?:unknown}}))} labels={{empty:t(locale,"noMapPoints"),sample:t(locale,"samplePoint"),drill:t(locale,"drillPoint"),boundary:t(locale,"licenceBoundary")}}/></Panel>
    <Panel title={t(locale,"geoAiTitle")} description={t(locale,"geoAiDescription")}><div className="grid gap-3 sm:grid-cols-2">
      <Alert variant="info">{highest===null?t(locale,"geoAiNoGrades"):t(locale,"geoAiHighestGrade",{grade:highest.toLocaleString(undefined,{maximumFractionDigits:6}),count:String(gradedCount)})}</Alert>
      <Alert variant={holes.length&&!intervals.length?"warning":"info"}>{holes.length&&!intervals.length?t(locale,"geoAiMissingIntervals"):t(locale,"geoAiCoverage",{holes:String(holes.length),intervals:String(intervals.length),boundaries:String(boundaries.length)})}</Alert>
    </div><p className="mt-3 text-xs text-muted-foreground">{t(locale,"geoAiEvidenceSources")}</p></Panel>
    <Panel title={t(locale,"samples")}>{canCreate&&<div className="mb-5 border-b pb-5"><SampleForm today={today}/></div>}{samples.length?<Table><TableHeader><TableRow><TableHead>{t(locale,"sampleCode")}</TableHead><TableHead>{t(locale,"sampleType")}</TableHead><TableHead>{t(locale,"collectedOn")}</TableHead><TableHead>{t(locale,"assayPpm")}</TableHead></TableRow></TableHeader><TableBody>{samples.map(s=><TableRow key={s.id}><TableCell className="font-medium">{s.sample_code}</TableCell><TableCell>{s.sample_type}</TableCell><TableCell>{s.collected_on}</TableCell><TableCell>{assayBySample.get(s.id)?.value_ppm??"—"}</TableCell></TableRow>)}</TableBody></Table>:<EmptyState icon={<FlaskConical/>} title={t(locale,"noSamples")}/>}</Panel>
    {/* Listed, not only entered. This panel previously held the entry form and nothing else, so a
        reader without geology.create — or one whose site has no samples yet — saw a titled box with
        nothing inside it and no way to tell whether that meant "none recorded" or "not for you". */}
    <Panel title={t(locale,"assays")}>{canCreate&&samples.length>0&&<div className="mb-5 border-b pb-5"><AssayForm samples={samples.map(s=>({id:s.id,sample_code:s.sample_code}))} today={today}/></div>}{assays.length?<Table><TableHeader><TableRow><TableHead>{t(locale,"sampleCode")}</TableHead><TableHead>{t(locale,"analyte")}</TableHead><TableHead>{t(locale,"assayPpm")}</TableHead><TableHead>{t(locale,"assayMethod")}</TableHead><TableHead>{t(locale,"testedOn")}</TableHead></TableRow></TableHeader><TableBody>{assays.map(a=><TableRow key={a.id}><TableCell className="font-medium">{samples.find(s=>s.id===a.sample_id)?.sample_code??"—"}</TableCell><TableCell>{a.analyte}</TableCell><TableCell className="tabular-nums">{a.value_ppm??"—"}</TableCell><TableCell>{a.method??"—"}</TableCell><TableCell>{a.tested_on}</TableCell></TableRow>)}</TableBody></Table>:<EmptyState icon={<FlaskConical/>} title={t(locale,"noAssays")}/>}</Panel>
    <Panel title={t(locale,"drillHoles")}>{canCreate&&<div className="mb-5 border-b pb-5"><DrillHoleForm/></div>}{holes.length?<Table><TableHeader><TableRow><TableHead>{t(locale,"holeCode")}</TableHead><TableHead>{t(locale,"fStatus")}</TableHead><TableHead>{t(locale,"latitude")}</TableHead><TableHead>{t(locale,"longitude")}</TableHead></TableRow></TableHeader><TableBody>{holes.map(h=><TableRow key={h.id}><TableCell className="font-medium">{h.hole_code}</TableCell><TableCell>{h.status}</TableCell><TableCell>{h.latitude}</TableCell><TableCell>{h.longitude}</TableCell></TableRow>)}</TableBody></Table>:<EmptyState icon={<MapPinned/>} title={t(locale,"noDrillHoles")}/>}</Panel>
    <Panel title={t(locale,"drillIntervals")}>{canCreate&&holes.length>0&&<div className="mb-5 border-b pb-5"><DrillIntervalForm holes={holes.map(h=>({id:h.id,hole_code:h.hole_code}))}/></div>}{intervals.length?<Table><TableHeader><TableRow><TableHead>{t(locale,"drillHole")}</TableHead><TableHead>{t(locale,"depthInterval")}</TableHead><TableHead>{t(locale,"lithology")}</TableHead><TableHead>{t(locale,"assayPpm")}</TableHead></TableRow></TableHeader><TableBody>{intervals.map(i=><TableRow key={i.id}><TableCell>{holes.find(h=>h.id===i.drill_hole_id)?.hole_code??"—"}</TableCell><TableCell>{i.from_depth_m}–{i.to_depth_m} m</TableCell><TableCell>{i.lithology??"—"}</TableCell><TableCell>{i.grade_ppm??"—"}</TableCell></TableRow>)}</TableBody></Table>:<EmptyState title={t(locale,"noDrillIntervals")}/>}</Panel>
    <Panel title={t(locale,"licenceBoundaries")}>{canCreate&&<div className="mb-5 border-b pb-5"><BoundaryForm licences={licencesResult.data??[]} today={today}/></div>}{boundaries.length?<Table><TableHeader><TableRow><TableHead>{t(locale,"boundaryName")}</TableHead><TableHead>{t(locale,"fDate")}</TableHead><TableHead>{t(locale,"boundarySource")}</TableHead></TableRow></TableHeader><TableBody>{boundaries.map(b=><TableRow key={b.id}><TableCell>{b.name}</TableCell><TableCell>{b.recorded_on}</TableCell><TableCell>{b.source??"—"}</TableCell></TableRow>)}</TableBody></Table>:<EmptyState title={t(locale,"noBoundaries")}/>}</Panel>
    {documentsEnabled()&&<><DocumentPanel title={t(locale,"geologicalFiles")} scope="geology" documents={filesResult.data??[]}/>{canUpdate&&<Panel title={t(locale,"attachGeologicalFile")}><DocumentUploadForm scope="geology" ownerId={site.id}/></Panel>}</>}
  </div>;
}
