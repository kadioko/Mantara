"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ActionFeedback } from "@/components/ui/feedback";
import { fieldClass } from "@/components/ui/form";
import { useT } from "@/lib/i18n/client";
import { saveForecastAssumption, type ForecastState } from "./actions";

export function ForecastAssumptionForm({ today }: { today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(saveForecastAssumption, {} as ForecastState);
  return <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <label className="text-sm font-semibold">{tr("commodity")}<input required name="commodity" defaultValue="Gold" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("fCurrency")}<input required name="currencyCode" defaultValue="USD" minLength={3} maxLength={3} className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("pricePerOunce")}<input required type="number" min="0" step="0.01" name="pricePerOunce" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("recoveryPercent")}<input required type="number" min="0" max="100" step="0.001" name="recoveryPercent" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("forecastDays")}<input required type="number" min="1" max="366" step="1" name="forecastDays" defaultValue="30" className={fieldClass} /></label>
    <label className="text-sm font-semibold">{tr("effectiveOn")}<input required type="date" name="effectiveOn" defaultValue={today} className={fieldClass} /></label>
    <label className="text-sm font-semibold sm:col-span-2 lg:col-span-3">{tr("fNotes")}<textarea name="notes" rows={2} maxLength={1000} className={fieldClass} /></label>
    <div className="sm:col-span-2 lg:col-span-3"><ActionFeedback state={state} /><Button disabled={pending} className="mt-3">{pending ? tr("saving") : tr("saveForecastAssumptions")}</Button></div>
  </form>;
}
