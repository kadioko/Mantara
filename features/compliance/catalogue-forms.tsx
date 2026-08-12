"use client";

import { useT } from "@/lib/i18n/client";

import { CatalogueRow } from "@/components/ui/catalogue";
import { Field, controlClass, fieldClass, selectClass, textareaClass } from "@/components/ui/form";
import { setRequirementStatus, updateLicence, updateRequirement } from "./catalogue-actions";
import { licenceStatusLabels, licenceStatuses, recurrenceIntervals, recurrenceLabels } from "./schemas";

export type CatalogueLicence = {
  id: string;
  licence_number: string;
  licence_type: string;
  issuing_authority: string | null;
  holder_name: string | null;
  issued_on: string | null;
  expires_on: string | null;
  status: string;
  notes: string | null;
};

export type CatalogueRequirement = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  recurrence: string;
  is_active: boolean;
};

/**
 * A licence is never retired from this row. Its lifecycle is the `status` field — surrendered,
 * expired, suspended — which is a matter of record, not of housekeeping, and belongs in the edit
 * form where the reader can see the dates that go with it.
 */
export function LicenceRow({ licence, canManage }: { licence: CatalogueLicence; canManage: boolean }) {
  const tr = useT();
  return (
    <CatalogueRow
      id={licence.id}
      name={`${licence.licence_number} · ${licence.licence_type}`}
      detail={[
        licenceStatusLabels[licence.status as keyof typeof licenceStatusLabels] ?? licence.status,
        licence.issuing_authority,
        licence.expires_on && `expires ${licence.expires_on}`,
      ].filter(Boolean).join(" · ")}
      isActive
      canManage={canManage}
      updateAction={updateLicence}
    >
      <Field label={tr("fLicenceNumber")} required>
        <input name="licenceNumber" required maxLength={120} defaultValue={licence.licence_number} className={fieldClass} />
      </Field>
      <Field label={tr("fLicenceType")} required>
        <input name="licenceType" required maxLength={120} defaultValue={licence.licence_type} className={fieldClass} />
      </Field>
      <Field label={tr("fStatus")} required>
        <select name="status" required defaultValue={licence.status} className={selectClass}>
          {licenceStatuses.map((value) => <option key={value} value={value}>{licenceStatusLabels[value]}</option>)}
        </select>
      </Field>
      <Field label={tr("fIssuingAuthority")}>
        <input name="issuingAuthority" maxLength={160} defaultValue={licence.issuing_authority ?? ""} className={fieldClass} />
      </Field>
      <Field label={tr("fHolder")}>
        <input name="holderName" maxLength={160} defaultValue={licence.holder_name ?? ""} className={fieldClass} />
      </Field>
      <Field label={tr("fIssuedOn")}>
        <input name="issuedOn" type="date" defaultValue={licence.issued_on ?? ""} className={fieldClass} />
      </Field>
      <Field label={tr("fExpiresOn")} hint={tr("uiThisDateDrivesTheExpiryWarningSoItIsWorth")}>
        <input name="expiresOn" type="date" defaultValue={licence.expires_on ?? ""} className={fieldClass} />
      </Field>
      <Field label={tr("fNotes")} className="md:col-span-2">
        <input name="notes" maxLength={2000} defaultValue={licence.notes ?? ""} className={controlClass} />
      </Field>
    </CatalogueRow>
  );
}

export function RequirementRow({
  requirement,
  canManage,
}: {
  requirement: CatalogueRequirement;
  canManage: boolean;
}) {
  const tr = useT();
  return (
    <CatalogueRow
      id={requirement.id}
      name={requirement.name}
      detail={[
        recurrenceLabels[requirement.recurrence as keyof typeof recurrenceLabels] ?? requirement.recurrence,
        requirement.category,
      ].filter(Boolean).join(" · ")}
      isActive={requirement.is_active}
      canManage={canManage}
      updateAction={updateRequirement}
      statusAction={setRequirementStatus}
      retireLabel="Retire"
      restoreLabel="Reinstate"
    >
      <Field label={tr("fRequirement")} required className="md:col-span-2">
        <input name="name" required maxLength={160} defaultValue={requirement.name} className={fieldClass} />
      </Field>
      <Field label={tr("fRecurrence")} required hint={tr("uiCompletingATaskSchedulesTheNextOneThisFarAhead")}>
        <select name="recurrence" required defaultValue={requirement.recurrence} className={selectClass}>
          {recurrenceIntervals.map((value) => <option key={value} value={value}>{recurrenceLabels[value]}</option>)}
        </select>
      </Field>
      <Field label={tr("fCategory")}>
        <input name="category" maxLength={120} defaultValue={requirement.category ?? ""} className={fieldClass} />
      </Field>
      <Field label={tr("fDescription")} className="md:col-span-2">
        <textarea name="description" maxLength={2000} rows={2} defaultValue={requirement.description ?? ""} className={textareaClass} />
      </Field>
    </CatalogueRow>
  );
}
