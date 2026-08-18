import { redirect } from "next/navigation";
import { Alert, EmptyState, PageHeader, StatCard } from "@/components/ui/feedback";
import { Panel } from "@/components/ui/card";
import { fieldClass } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import { ForecastAssumptionForm } from "@/features/intelligence/forecast-assumption-form";

type IntelligenceRow = {
  currency_code:string; production_tonnes:number|string; contained_grams:number|string; contained_ounces:number|string;
  approved_spend:number|string; budget_variance:number|string; budget_used_percent:number|string|null;
  cost_per_tonne:number|string|null; cost_per_gram:number|string|null; cost_per_ounce:number|string|null;
  tonnes_per_worker_day:number|string|null; equipment_utilization_percent:number|string|null;
  projected_30_day_tonnes:number|string; projected_30_day_spend:number|string;
};
type ForecastRow = {
  commodity:string; currency_code:string; forecast_days:number; recovery_percent:number|string; price_per_ounce:number|string;
  forecast_tonnes:number|string; forecast_recovered_ounces:number|string; forecast_revenue:number|string;
  recorded_paid_outflow:number|string; forecast_outflow:number|string; forecast_net_cashflow:number|string;
  assumption_updated_at:string;
};
type DailySummary = {
  date:string; production?:{approvedTonnes:number;entries:number}; attendance?:{presentOrLate:number;recorded:number};
  expenses?:Array<{currency:string;amount:number}>; safety?:{incidents:number;inspections:number}; evidence:string[];
};
const fmt=(value:number|string|null|undefined,digits=2)=>value===null||value===undefined?"—":Number(value).toLocaleString(undefined,{maximumFractionDigits:digits});
/** A unit belongs to a number, not to a dash. Without this an unknown utilization read "—%". */
const withUnit=(value:number|string|null|undefined,unit:string,digits=2)=>value===null||value===undefined?"—":`${fmt(value,digits)}${unit}`;

export default async function IntelligencePage({searchParams}:{searchParams:Promise<{from?:string;to?:string}>}){
  const [workspace,locale,query]=await Promise.all([getActiveWorkspace(),getLocale(),searchParams]);
  const organization=workspace.activeOrganization,site=workspace.activeSite;
  if(!organization||!site||!await hasPermission(organization.id,"production.read")||!await hasPermission(organization.id,"expense.read"))redirect("/dashboard");
  const today=new Date().toISOString().slice(0,10),first=`${today.slice(0,7)}-01`;
  const from=/^\d{4}-\d{2}-\d{2}$/.test(query.from??"")?query.from!:first;
  const to=/^\d{4}-\d{2}-\d{2}$/.test(query.to??"")?query.to!:today;
  const [intelligenceResult,forecastResult,summaryResult,canManage]=await Promise.all([
    workspace.supabase.rpc("site_operational_intelligence",{requested_site_id:site.id,requested_from:from,requested_to:to}),
    workspace.supabase.rpc("site_cashflow_forecast",{requested_site_id:site.id,history_from:from,history_to:to}),
    workspace.supabase.rpc("site_daily_summary",{requested_site_id:site.id,requested_date:to}),
    Promise.all([hasPermission(organization.id,"production.update"),hasPermission(organization.id,"expense.update")]).then(x=>x.every(Boolean)),
  ]);
  /*
    An error and an empty site are different facts, and this screen used to render them identically:
    a failed RPC became an empty array and the reader was told "no intelligence yet" for a site with
    a year of production in it. lib/totals.ts already takes the other line — "zero is a claim, and it
    is the wrong claim when the truth is that we could not find out" — and this now follows it.
  */
  const failed=[intelligenceResult.error,forecastResult.error,summaryResult.error].filter(Boolean).length>0;
  const rows=(intelligenceResult.error?[]:intelligenceResult.data??[]) as IntelligenceRow[];
  const forecasts=(forecastResult.error?[]:forecastResult.data??[]) as ForecastRow[];
  const summary=(summaryResult.error?null:summaryResult.data) as DailySummary|null;
  const base=rows[0];
  return <div className="space-y-6">
    <PageHeader eyebrow={t(locale,"riskAndInsight")} title={t(locale,"intelligenceTitle")} description={t(locale,"intelligenceDescription",{site:site.name})}/>
    <Panel title={t(locale,"intelligencePeriod")}><form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
      <label className="text-sm font-semibold">{t(locale,"fromDate")}<input name="from" type="date" defaultValue={from} className={fieldClass}/></label>
      <label className="text-sm font-semibold">{t(locale,"toDate")}<input name="to" type="date" defaultValue={to} className={fieldClass}/></label>
      <div className="flex items-end"><Button>{t(locale,"applyPeriod")}</Button></div>
    </form></Panel>
    <Alert variant="info"><strong>{t(locale,"intelligenceMethod")}:</strong> {t(locale,"intelligenceMethodDescription")}</Alert>
    {failed&&<Alert variant="destructive">{t(locale,"figuresUnavailable")}</Alert>}
    {!base?<EmptyState title={t(locale,"noIntelligence")}/>:<>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t(locale,"productionTonnes")} value={fmt(base.production_tonnes,3)}/>
        <StatCard label={t(locale,"containedGold")} value={`${fmt(base.contained_grams,3)} g · ${fmt(base.contained_ounces,3)} oz`}/>
        <StatCard label={t(locale,"workerProductivity")} value={fmt(base.tonnes_per_worker_day,3)}/>
        <StatCard label={t(locale,"equipmentUtilization")} value={withUnit(base.equipment_utilization_percent,"%",1)}/>
      </div>
      {rows.map(row=><Panel key={row.currency_code} title={row.currency_code} description={`${from} — ${to}`}><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t(locale,"approvedSpendLabel")} value={`${row.currency_code} ${fmt(row.approved_spend)}`}/>
        <StatCard label={t(locale,"budgetUsed")} value={withUnit(row.budget_used_percent,"%",1)}/>
        <StatCard label={t(locale,"budgetRemaining")} value={`${row.currency_code} ${fmt(row.budget_variance)}`} tone={Number(row.budget_variance)<0?"destructive":"default"}/>
        <StatCard label={t(locale,"costPerTonne")} value={`${row.currency_code} ${fmt(row.cost_per_tonne)}`}/>
        <StatCard label={t(locale,"costPerGram")} value={`${row.currency_code} ${fmt(row.cost_per_gram)}`}/>
        <StatCard label={t(locale,"costPerOunce")} value={`${row.currency_code} ${fmt(row.cost_per_ounce)}`}/>
        <StatCard label={t(locale,"projectedProduction")} value={`${fmt(row.projected_30_day_tonnes,3)} t`}/>
        <StatCard label={t(locale,"projectedSpend")} value={`${row.currency_code} ${fmt(row.projected_30_day_spend)}`}/>
      </div></Panel>)}<Alert variant="warning">{t(locale,"runRateWarning")}</Alert>
    </>}
    <Panel title={t(locale,"cashflowForecast")} description={t(locale,"cashflowForecastDescription")}>
      {forecasts.length?<div className="space-y-4">{forecasts.map(row=><div key={`${row.commodity}-${row.currency_code}`} className="rounded-xl border p-4">
        <div className="mb-3 flex flex-wrap justify-between gap-2"><strong>{row.commodity} · {row.currency_code}</strong><span className="text-xs text-muted-foreground">{t(locale,"assumptionUpdated")} {new Date(row.assumption_updated_at).toLocaleDateString(locale)}</span></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><StatCard label={t(locale,"forecastRecoveredOunces")} value={`${fmt(row.forecast_recovered_ounces,3)} oz`}/><StatCard label={t(locale,"forecastRevenue")} value={`${row.currency_code} ${fmt(row.forecast_revenue)}`}/><StatCard label={t(locale,"forecastOutflow")} value={`${row.currency_code} ${fmt(row.forecast_outflow)}`}/><StatCard label={t(locale,"forecastNetCashflow")} value={`${row.currency_code} ${fmt(row.forecast_net_cashflow)}`} tone={Number(row.forecast_net_cashflow)<0?"destructive":"default"}/></div>
        <p className="mt-3 text-xs text-muted-foreground">{t(locale,"forecastBasis",{days:String(row.forecast_days),recovery:fmt(row.recovery_percent,2),price:fmt(row.price_per_ounce)})}</p>
      </div>)}</div>:<EmptyState title={t(locale,"noForecastAssumptions")}/>}
      {canManage&&<div className="mt-5 border-t pt-5"><ForecastAssumptionForm today={today}/></div>}
    </Panel>
    <Panel title={t(locale,"dailySummary")} description={t(locale,"dailySummaryDescription",{date:to})}>{summary?<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label={t(locale,"dailyApprovedTonnes")} value={fmt(summary.production?.approvedTonnes??0,3)}/>
      <StatCard label={t(locale,"dailyAttendance")} value={`${summary.attendance?.presentOrLate??0}/${summary.attendance?.recorded??0}`}/>
      <StatCard label={t(locale,"dailyIncidents")} value={summary.safety?.incidents??0}/>
      <StatCard label={t(locale,"dailyInspections")} value={summary.safety?.inspections??0}/>
    </div>:<EmptyState title={t(locale,"noDailySummary")}/>}</Panel>
    <Panel title={t(locale,"mantaraBrain")} description={t(locale,"mantaraBrainDescription")}>
      <Alert variant="info"><strong>{t(locale,"evidenceBounded")}:</strong> {forecasts.length?t(locale,"brainForecastFinding",{count:String(forecasts.length)}):t(locale,"brainMissingAssumptions")}</Alert>
      <p className="mt-3 text-xs text-muted-foreground">{t(locale,"brainSources")}: {summary?.evidence?.join(", ")??"site_forecast_assumptions, production_entries, expenses"}</p>
    </Panel>
  </div>;
}
