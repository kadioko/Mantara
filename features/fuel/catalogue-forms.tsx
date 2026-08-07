"use client";

import { CatalogueRow } from "@/components/ui/catalogue";
import { Field, controlClass, fieldClass, selectClass } from "@/components/ui/form";
import { setFuelLocationStatus, updateFuelLocation } from "./catalogue-actions";
import { fuelTypeLabels, fuelTypes } from "./schemas";

export type CatalogueTank = {
  id: string;
  name: string;
  fuel_type: string;
  capacity_litres: string | number | null;
  current_balance_litres: string | number;
  notes: string | null;
  is_active: boolean;
};

/**
 * The balance is shown but never editable. It is derived from receipts, issues and adjustments, and
 * typing over it would break the reconciliation the fuel module exists to provide. Correcting a
 * balance is what a fuel adjustment is for, and that leaves a reason and an author behind it.
 */
export function TankRow({ tank, canManage }: { tank: CatalogueTank; canManage: boolean }) {
  const capacity = tank.capacity_litres === null ? "" : String(tank.capacity_litres);
  return (
    <CatalogueRow
      id={tank.id}
      name={tank.name}
      detail={[
        fuelTypeLabels[tank.fuel_type as keyof typeof fuelTypeLabels] ?? tank.fuel_type,
        `${Number(tank.current_balance_litres).toLocaleString()} L on hand`,
        capacity && `capacity ${Number(capacity).toLocaleString()} L`,
      ].filter(Boolean).join(" · ")}
      isActive={tank.is_active}
      canManage={canManage}
      updateAction={updateFuelLocation}
      statusAction={setFuelLocationStatus}
      retireLabel="Take out of service"
      restoreLabel="Return to service"
    >
      <Field label="Name" required><input name="name" required maxLength={120} defaultValue={tank.name} className={fieldClass} /></Field>
      <Field label="Fuel type" required>
        <select name="fuelType" required defaultValue={tank.fuel_type} className={selectClass}>
          {fuelTypes.map((value) => <option key={value} value={value}>{fuelTypeLabels[value]}</option>)}
        </select>
      </Field>
      <Field label="Capacity (litres)" hint="Leave blank if the tank has no stated capacity.">
        <input name="capacityLitres" type="number" min="0" step="0.001" defaultValue={capacity} className={fieldClass} />
      </Field>
      <Field label="Notes" className="md:col-span-3">
        <input name="notes" maxLength={2000} defaultValue={tank.notes ?? ""} className={controlClass} />
      </Field>
    </CatalogueRow>
  );
}
