import { redirect } from "next/navigation";
import { Alert, EmptyState, PageHeader, StatCard } from "@/components/ui/feedback";
import { Panel } from "@/components/ui/card";
import { fieldClass } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";

type IntelligenceRow = {
  currency_code: string; production_tonnes: number | string; contained_grams: number | string;
  contained_ounces: number | string; approved_spend: number | string; budget_amount: number | string;
  budget_variance: number | string; budget_used_percent: number | string | null; cost_per_tonne: number | string | null;
  cost_per_gram: number | string | null; cost_per_ounce: number | string | null; present_worker_days: number | string | null;
  tonnes_per_worker_day: number | string | null; recorded_equipment_hours: number | string | null;
  scheduled_shift_hours: number | string | null; equipment_utilization_percent: number | string | null;
  projected_30_day_tonnes: number | string; projected_30_day_spend: number | string;
};

const fmt = (value: number | string | null, maximumFractionDigits = 2) => value === null ? "—" : Number(value).toLocaleString(undefined, { maximumFractionDigits });

export default async function IntelligencePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const [workspace, locale, query] = await Promise.all([getActiveWorkspace(), getLocale(), searchParams]);
  const organization = workspace.activeOrganization; const site = workspace.activeSite;
  if (!organization || !site || !await hasPermission(organization.id, "production.read") || !await hasPermission(organization.id, "expense.read")) redirect("/dashboard");
  const today = new Date().toISOString().slice(0, 10);
  const first = `${today.slice(0, 7)}-01`;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.from ?? "") ? query.from! : first;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(query.to ?? "") ? query.to! : today;
  const { data, error } = await workspace.supabase.rpc("site_operational_intelligence", { requested_site_id: site.id, requested_from: from, requested_to: to });
  const rows = (error ? [] : data ?? []) as IntelligenceRow[];
  const base = rows[0];

  return <div className="space-y-6">
    <PageHeader eyebrow={t(locale, "riskAndInsight")} title={t(locale, "intelligenceTitle")} description={t(locale, "intelligenceDescription", { site: site.name })} />
    <Panel title={t(locale, "intelligencePeriod")}>
      <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-semibold">{t(locale, "fromDate")}<input name="from" type="date" defaultValue={from} className={fieldClass} /></label>
        <label className="text-sm font-semibold">{t(locale, "toDate")}<input name="to" type="date" defaultValue={to} className={fieldClass} /></label>
        <div className="flex items-end"><Button>{t(locale, "applyPeriod")}</Button></div>
      </form>
    </Panel>
    <Alert variant="info"><strong>{t(locale, "intelligenceMethod")}:</strong> {t(locale, "intelligenceMethodDescription")}</Alert>
    {!base ? <EmptyState title={t(locale, "noIntelligence")} /> : <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t(locale, "productionTonnes")} value={fmt(base.production_tonnes, 3)} />
        <StatCard label={t(locale, "containedGold")} value={`${fmt(base.contained_grams, 3)} g · ${fmt(base.contained_ounces, 3)} oz`} />
        <StatCard label={t(locale, "workerProductivity")} value={fmt(base.tonnes_per_worker_day, 3)} />
        <StatCard label={t(locale, "equipmentUtilization")} value={`${fmt(base.equipment_utilization_percent, 1)}%`} />
      </div>
      {rows.map((row) => <Panel key={row.currency_code} title={row.currency_code} description={`${from} — ${to}`}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t(locale, "approvedSpendLabel")} value={`${row.currency_code} ${fmt(row.approved_spend)}`} />
          <StatCard label={t(locale, "budgetUsed")} value={row.budget_used_percent === null ? "—" : `${fmt(row.budget_used_percent, 1)}%`} />
          <StatCard label={t(locale, "budgetRemaining")} value={`${row.currency_code} ${fmt(row.budget_variance)}`} tone={Number(row.budget_variance) < 0 ? "destructive" : "default"} />
          <StatCard label={t(locale, "costPerTonne")} value={`${row.currency_code} ${fmt(row.cost_per_tonne)}`} />
          <StatCard label={t(locale, "costPerGram")} value={`${row.currency_code} ${fmt(row.cost_per_gram)}`} />
          <StatCard label={t(locale, "costPerOunce")} value={`${row.currency_code} ${fmt(row.cost_per_ounce)}`} />
          <StatCard label={t(locale, "projectedProduction")} value={`${fmt(row.projected_30_day_tonnes, 3)} t`} />
          <StatCard label={t(locale, "projectedSpend")} value={`${row.currency_code} ${fmt(row.projected_30_day_spend)}`} />
        </div>
      </Panel>)}
      <Alert variant="warning">{t(locale, "runRateWarning")}</Alert>
    </>}
  </div>;
}
