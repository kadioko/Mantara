"use client";

import { useT } from "@/lib/i18n/client";

import { CatalogueRow } from "@/components/ui/catalogue";
import { Field, fieldClass } from "@/components/ui/form";
import { setExpenseCategoryStatus, updateExpenseCategory } from "./catalogue-actions";

export type CatalogueExpenseCategory = { id: string; name: string; is_active: boolean };

/**
 * Retiring a category strands nothing: expenses already filed against it keep pointing at it and
 * keep reporting correctly. It stops being offered on new entries, which is what an organization
 * wants when it reorganises its cost codes part-way through a year.
 */
export function ExpenseCategoryRow({
  category,
  canManage,
}: {
  category: CatalogueExpenseCategory;
  canManage: boolean;
}) {
  const tr = useT();
  return (
    <CatalogueRow
      id={category.id}
      name={category.name}
      isActive={category.is_active}
      canManage={canManage}
      updateAction={updateExpenseCategory}
      statusAction={setExpenseCategoryStatus}
      restoreLabel="Reinstate"
    >
      <Field label={tr("fName")} required className="md:col-span-3">
        <input name="name" required maxLength={120} defaultValue={category.name} className={fieldClass} />
      </Field>
    </CatalogueRow>
  );
}
