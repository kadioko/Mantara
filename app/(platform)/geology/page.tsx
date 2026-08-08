import { redirect } from "next/navigation";
import { FlaskConical, MapPinned } from "lucide-react";
import { Alert, EmptyState, PageHeader, StatCard } from "@/components/ui/feedback";
import { Panel } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hasPermission } from "@/lib/auth/permissions"; import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale"; import { t } from "@/lib/i18n/messages";
import { AssayForm, DrillHoleForm, SampleForm } from "@/features/geology/geology-forms";
import { ExplorationPlot } from "@/features/geology/exploration-plot";
import { DocumentPanel } from "@/features/documents/document-panel";
import { DocumentUploadForm } from "@/features/documents/document-upload-form";
import { documentsEnabled } from "@/lib/features";

export default async function GeologyPage(){const [w,locale]=await Promise.all([getActiveWorkspace(),getLocale()]);const org=w.activeOrganization,site=w.activeSite;if(!org||!site||!await hasPermission(org.id,"geology.read"))redirect("/dashboard");const [canCreate,canUpdate]=await Promise.all([hasPermission(org.id,"geology.create"),hasPermission(org.id,"geology.update")]);const [samplesResult,assaysResult,holesResult,filesResult]=await Promise.all([
  w.supabase.from("geological_samples").select("id,sample_code,sample_type,collected_on,latitude,longitude,material").eq("organization_id",org.id).eq("mine_site_id",site.id).order("collected_on",{ascending:false}).limit(100),
  w.supabase.from("geological_assays").select("id,sample_id,analyte,value_ppm,method,laboratory,tested_on").eq("organization_id",org.id).eq("mine_site_id",site.id).order("tested_on",{ascending:false}).limit(100),
  w.supabase.from("drill_holes").select("id,hole_code,latitude,longitude,status,planned_depth_m,actual_depth_m").eq("organization_id",org.id).eq("mine_site_id",site.id).order("created_at",{ascending:false}).limit(100),
  w.supabase.from("geological_files").select("id,document_name,document_path").eq("organization_id",org.id).eq("mine_site_id",site.id).order("created_at",{ascending:false})
]);const samples=samplesResult.data??[],assays=assaysResult.data??[],holes=holesResult.data??[];const assayBySample=new Map(assays.map(a=>[a.sample_id,a]));const points=[...samples.map(s=>({id:s.id,code:s.sample_code,latitude:s.latitude,longitude:s.longitude,kind:"sample" as const,grade:assayBySample.get(s.id)?.value_ppm})),...holes.map(h=>({id:h.id,code:h.hole_code,latitude:h.latitude,longitude:h.longitude,kind:"drill" as const}))];const today=new Date().toISOString().slice(0,10);return <div className="space-y-6">
  <PageHeader eyebrow={t(locale,"recordedEvidence")} title={t(locale,"geologyTitle")} description={t(locale,"geologyDescription",{site:site.name})}/><Alert variant="warning">{t(locale,"geoEvidenceWarning")}</Alert>
  <div className="grid gap-4 sm:grid-cols-3"><StatCard label={t(locale,"samples")} value={samples.length}/><StatCard label={t(locale,"assays")} value={assays.length}/><StatCard label={t(locale,"drillHoles")} value={holes.length}/></div>
  <Panel title={t(locale,"explorationPlot")} description={t(locale,"explorationPlotDescription")}><ExplorationPlot points={points} labels={{empty:t(locale,"noMapPoints"),sample:t(locale,"samplePoint"),drill:t(locale,"drillPoint")}}/></Panel>
  <Panel title={t(locale,"samples")}>{canCreate&&<div className="mb-5 border-b pb-5"><SampleForm today={today}/></div>}{samples.length?<Table><TableHeader><TableRow><TableHead>{t(locale,"sampleCode")}</TableHead><TableHead>{t(locale,"sampleType")}</TableHead><TableHead>{t(locale,"collectedOn")}</TableHead><TableHead>{t(locale,"assayPpm")}</TableHead></TableRow></TableHeader><TableBody>{samples.map(s=><TableRow key={s.id}><TableCell className="font-medium">{s.sample_code}</TableCell><TableCell>{s.sample_type}</TableCell><TableCell>{s.collected_on}</TableCell><TableCell>{assayBySample.get(s.id)?.value_ppm??"—"}</TableCell></TableRow>)}</TableBody></Table>:<EmptyState icon={<FlaskConical/>} title={t(locale,"noSamples")}/>}</Panel>
  <Panel title={t(locale,"assays")}>{canCreate&&samples.length>0&&<AssayForm samples={samples.map(s=>({id:s.id,sample_code:s.sample_code}))} today={today}/>}</Panel>
  <Panel title={t(locale,"drillHoles")}>{canCreate&&<div className="mb-5 border-b pb-5"><DrillHoleForm/></div>}{holes.length?<Table><TableHeader><TableRow><TableHead>{t(locale,"holeCode")}</TableHead><TableHead>{t(locale,"fStatus")}</TableHead><TableHead>{t(locale,"latitude")}</TableHead><TableHead>{t(locale,"longitude")}</TableHead></TableRow></TableHeader><TableBody>{holes.map(h=><TableRow key={h.id}><TableCell className="font-medium">{h.hole_code}</TableCell><TableCell>{h.status}</TableCell><TableCell>{h.latitude}</TableCell><TableCell>{h.longitude}</TableCell></TableRow>)}</TableBody></Table>:<EmptyState icon={<MapPinned/>} title={t(locale,"noDrillHoles")}/>}</Panel>
  {documentsEnabled()&&<><DocumentPanel title={t(locale,"geologicalFiles")} scope="geology" documents={filesResult.data??[]}/>{canUpdate&&<Panel title={t(locale,"attachGeologicalFile")}><DocumentUploadForm scope="geology" ownerId={site.id}/></Panel>}</>}
  </div>}
