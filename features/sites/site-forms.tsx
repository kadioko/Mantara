"use client";

import { useActionState, useState } from "react";
import { MapPin, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { selectClass } from "@/components/ui/form";
import { ActionFeedback, Alert } from "@/components/ui/feedback";
import { createSite, updateOrganization, updateSite, type SiteState } from "./actions";
import { siteStatusLabels, siteStatuses } from "./schemas";
import { useT } from "@/lib/i18n/client";

export type SiteDetails = {
  id: string;
  name: string;
  country_code: string;
  region: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
};

/** Coordinates are optional, but the database stores both or neither, so they are asked for together. */
function CoordinateFields({ latitude, longitude }: { latitude?: number | null; longitude?: number | null }) {
  const tr = useT();
  return (
    <>
      <div>
        <Label htmlFor="latitude">{tr("latitude")}</Label>
        <Input id="latitude" name="latitude" type="number" step="0.000001" min="-90" max="90" defaultValue={latitude ?? ""} className="mt-1" />
      </div>
      <div>
        <Label htmlFor="longitude">{tr("longitude")}</Label>
        <Input id="longitude" name="longitude" type="number" step="0.000001" min="-180" max="180" defaultValue={longitude ?? ""} className="mt-1" />
      </div>
    </>
  );
}

export function CreateSiteForm({ defaultCountry }: { defaultCountry: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(createSite, {} as SiteState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return <Button onClick={() => setOpen(true)}><Plus aria-hidden />{tr("addMineSite")}</Button>;
  }

  return <form action={action} className="grid gap-4 md:grid-cols-3">
    <div className="md:col-span-2">
      <Label htmlFor="name">{tr("fSiteName")} *</Label>
      <Input id="name" name="name" required maxLength={120} placeholder={tr("siteNameExample")} className="mt-1" />
    </div>
    <div>
      <Label htmlFor="countryCode">{tr("fCountryCode")} *</Label>
      <Input id="countryCode" name="countryCode" required maxLength={2} defaultValue={defaultCountry} className="mt-1 uppercase" />
    </div>
    <div><Label htmlFor="region">{tr("fRegion")}</Label><Input id="region" name="region" maxLength={120} className="mt-1" /></div>
    <div><Label htmlFor="district">{tr("fDistrict")}</Label><Input id="district" name="district" maxLength={120} className="mt-1" /></div>
    <div />
    <CoordinateFields />
    <div className="md:col-span-3"><ActionFeedback state={state} /></div>
    <div className="flex gap-2 md:col-span-3">
      <Button disabled={pending}>{pending ? tr("saving") : tr("addMineSite")}</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{tr("cancel")}</Button>
    </div>
  </form>;
}

export function EditSiteForm({ site, isActiveSite }: { site: SiteDetails; isActiveSite: boolean }) {
  const tr = useT();
  const [state, action, pending] = useActionState(updateSite, {} as SiteState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return <Button variant="outline" size="sm" onClick={() => setOpen(true)}><Pencil aria-hidden />{tr("edit")}</Button>;
  }

  return <form action={action} className="grid gap-4 md:grid-cols-3">
    <input name="siteId" type="hidden" value={site.id} />
    <div className="md:col-span-2">
      <Label htmlFor={`name-${site.id}`}>{tr("fSiteName")} *</Label>
      <Input id={`name-${site.id}`} name="name" required maxLength={120} defaultValue={site.name} className="mt-1" />
    </div>
    <div>
      <Label htmlFor={`country-${site.id}`}>{tr("fCountryCode")} *</Label>
      <Input id={`country-${site.id}`} name="countryCode" required maxLength={2} defaultValue={site.country_code} className="mt-1 uppercase" />
    </div>
    <div><Label htmlFor={`region-${site.id}`}>{tr("fRegion")}</Label><Input id={`region-${site.id}`} name="region" maxLength={120} defaultValue={site.region ?? ""} className="mt-1" /></div>
    <div><Label htmlFor={`district-${site.id}`}>{tr("fDistrict")}</Label><Input id={`district-${site.id}`} name="district" maxLength={120} defaultValue={site.district ?? ""} className="mt-1" /></div>
    <div>
      <Label htmlFor={`status-${site.id}`}>{tr("status")}</Label>
      <select id={`status-${site.id}`} name="status" defaultValue={site.status} className={selectClass}>
        {siteStatuses.map((value) => <option key={value} value={value}>{siteStatusLabels[value]}</option>)}
      </select>
    </div>
    <CoordinateFields latitude={site.latitude} longitude={site.longitude} />
    {isActiveSite && (
      <div className="md:col-span-3">
        <Alert variant="info">
          {tr("activeSiteWarning")}
        </Alert>
      </div>
    )}
    <div className="md:col-span-3"><ActionFeedback state={state} /></div>
    <div className="flex gap-2 md:col-span-3">
      <Button disabled={pending}>{pending ? tr("saving") : tr("actSaveChanges")}</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{tr("cancel")}</Button>
    </div>
  </form>;
}

export function OrganizationForm({ name, countryCode }: { name: string; countryCode: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(updateOrganization, {} as SiteState);
  return <form action={action} className="grid gap-4 sm:grid-cols-[2fr_1fr] sm:items-end">
    <div>
      <Label htmlFor="organizationName">{tr("organizationName")} *</Label>
      <Input id="organizationName" name="name" required maxLength={120} defaultValue={name} className="mt-1" />
    </div>
    <div>
      <Label htmlFor="organizationCountry">{tr("fCountryCode")} *</Label>
      <Input id="organizationCountry" name="countryCode" required maxLength={2} defaultValue={countryCode} className="mt-1 uppercase" />
    </div>
    <div className="sm:col-span-2"><ActionFeedback state={state} /></div>
    <div className="sm:col-span-2"><Button disabled={pending}><MapPin aria-hidden />{pending ? tr("saving") : tr("saveOrganization")}</Button></div>
  </form>;
}
