"use client";

import { useT } from "@/lib/i18n/client";

import { CatalogueRow } from "@/components/ui/catalogue";
import { Field, controlClass, fieldClass, selectClass, textareaClass } from "@/components/ui/form";
import {
  setInventoryItemStatus,
  setInventoryLocationStatus,
  setSupplierStatus,
  updateInventoryCategory,
  updateInventoryItem,
  updateInventoryLocation,
  updateSupplier,
} from "./catalogue-actions";
import type { Option } from "./inventory-forms";

export type CatalogueItem = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  reorder_level: string | number | null;
  category_id: string | null;
  notes: string | null;
  is_active: boolean;
};

export type CatalogueStore = { id: string; name: string; notes: string | null; is_active: boolean };
export type CatalogueSupplier = {
  id: string;
  name: string;
  contact_name: string | null;
  phone_number: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
};
export type CatalogueCategory = { id: string; name: string };

/**
 * A category has no retire control. Nothing is stranded by a stale category and nothing points at
 * one that would break, so an organization that reorganises simply renames it. Passing no
 * statusAction is what removes the control, rather than hiding a button that would post nothing.
 */
export function CategoryRow({ category, canManage }: { category: CatalogueCategory; canManage: boolean }) {
  const tr = useT();
  return (
    <CatalogueRow
      id={category.id}
      name={category.name}
      isActive
      canManage={canManage}
      updateAction={updateInventoryCategory}
    >
      <Field label={tr("fName")} required className="md:col-span-3">
        <input name="name" required maxLength={120} defaultValue={category.name} className={fieldClass} />
      </Field>
    </CatalogueRow>
  );
}

export function ItemRow({
  item,
  categories,
  canManage,
}: {
  item: CatalogueItem;
  categories: Option[];
  canManage: boolean;
}) {
  const tr = useT();
  const reorder = item.reorder_level === null ? "" : String(item.reorder_level);
  return (
    <CatalogueRow
      id={item.id}
      name={item.name}
      detail={[item.sku, `per ${item.unit}`, reorder && `reorder at ${reorder}`].filter(Boolean).join(" · ")}
      isActive={item.is_active}
      canManage={canManage}
      updateAction={updateInventoryItem}
      statusAction={setInventoryItemStatus}
    >
      <Field label={tr("fName")} required><input name="name" required maxLength={160} defaultValue={item.name} className={fieldClass} /></Field>
      <Field label={tr("fSku")}><input name="sku" maxLength={80} defaultValue={item.sku ?? ""} className={fieldClass} /></Field>
      <Field label={tr("fUnit")} required><input name="unit" required maxLength={20} defaultValue={item.unit} className={fieldClass} /></Field>
      <Field label={tr("fCategory")}>
        <select name="categoryId" defaultValue={item.category_id ?? ""} className={selectClass}>
          <option value="">{tr("optUncategorised")}</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
        </select>
      </Field>
      <Field label={tr("fReorderLevel")} hint={tr("uiLeaveBlankForNoReorderWarning")}>
        <input name="reorderLevel" type="number" min="0" step="0.001" defaultValue={reorder} className={fieldClass} />
      </Field>
      <Field label={tr("fNotes")} className="md:col-span-3">
        <textarea name="notes" maxLength={2000} rows={2} defaultValue={item.notes ?? ""} className={textareaClass} />
      </Field>
    </CatalogueRow>
  );
}

export function StoreRow({ store, canManage }: { store: CatalogueStore; canManage: boolean }) {
  const tr = useT();
  return (
    <CatalogueRow
      id={store.id}
      name={store.name}
      detail={store.notes}
      isActive={store.is_active}
      canManage={canManage}
      updateAction={updateInventoryLocation}
      statusAction={setInventoryLocationStatus}
      retireLabel="Take out of service"
      restoreLabel="Return to service"
    >
      <Field label={tr("fName")} required><input name="name" required maxLength={120} defaultValue={store.name} className={fieldClass} /></Field>
      <Field label={tr("fNotes")} className="md:col-span-2">
        <input name="notes" maxLength={500} defaultValue={store.notes ?? ""} className={controlClass} />
      </Field>
    </CatalogueRow>
  );
}

export function SupplierRow({ supplier, canManage }: { supplier: CatalogueSupplier; canManage: boolean }) {
  const tr = useT();
  return (
    <CatalogueRow
      id={supplier.id}
      name={supplier.name}
      detail={[supplier.contact_name, supplier.phone_number, supplier.email].filter(Boolean).join(" · ")}
      isActive={supplier.is_active}
      canManage={canManage}
      updateAction={updateSupplier}
      statusAction={setSupplierStatus}
      restoreLabel="Reinstate"
    >
      <Field label={tr("fName")} required><input name="name" required maxLength={160} defaultValue={supplier.name} className={fieldClass} /></Field>
      <Field label={tr("fContact")}><input name="contactName" maxLength={160} defaultValue={supplier.contact_name ?? ""} className={fieldClass} /></Field>
      <Field label={tr("fPhone")}><input name="phoneNumber" inputMode="tel" maxLength={40} defaultValue={supplier.phone_number ?? ""} className={fieldClass} /></Field>
      <Field label={tr("fEmail")}><input name="email" type="email" maxLength={200} defaultValue={supplier.email ?? ""} className={fieldClass} /></Field>
      <Field label={tr("fNotes")} className="md:col-span-2">
        <input name="notes" maxLength={500} defaultValue={supplier.notes ?? ""} className={controlClass} />
      </Field>
    </CatalogueRow>
  );
}
