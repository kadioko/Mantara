/**
 * What an organization's own copy of its data contains.
 *
 * This exists because a mining company evaluating Mantara asks one question before it puts a year of
 * production into it: *can we get it back out?* Until now the honest answer was no — the four
 * reports are date-ranged and scoped to a single mine site, so a company with two pits could not
 * assemble its own records even by hand.
 *
 * **The list is written out rather than discovered.** Reading `information_schema` at runtime would
 * be shorter and would quietly export whatever happened to be there — including tables that are
 * operational telemetry rather than the customer's records. Naming each one is a decision, and the
 * decisions are reviewable. `tests/unit/export-catalogue.test.ts` fails when a table carrying
 * `organization_id` appears in the migrations and is neither exported nor excluded here, so the list
 * cannot fall behind the schema in silence.
 */

/** A table the export carries, and the permission that decides whether this reader may have it. */
export interface ExportedTable {
  table: string;
  /** The module read permission. A reader without it gets the table listed as withheld, not hidden. */
  permission: string;
  /** Ordering column, so two exports of unchanged data are byte-identical and can be diffed. */
  orderBy: string;
}

/** A table deliberately left out, and why. Every exclusion is stated so none is an oversight. */
export interface ExcludedTable {
  table: string;
  reason: string;
}

export const exportedTables: ExportedTable[] = [
  // Organization and structure
  { table: "mine_sites", permission: "site.read", orderBy: "created_at" },
  { table: "organization_memberships", permission: "member.read", orderBy: "created_at" },
  { table: "organization_invitations", permission: "member.read", orderBy: "created_at" },
  { table: "membership_sites", permission: "member.read", orderBy: "user_id" },
  { table: "roles", permission: "role.read", orderBy: "created_at" },

  // Workforce
  { table: "workers", permission: "worker.read", orderBy: "created_at" },
  { table: "worker_assignments", permission: "worker.read", orderBy: "created_at" },
  { table: "training_records", permission: "worker.read", orderBy: "created_at" },
  { table: "ppe_issues", permission: "worker.read", orderBy: "created_at" },
  { table: "attendance_records", permission: "worker.read", orderBy: "created_at" },
  { table: "shifts", permission: "production.read", orderBy: "created_at" },
  { table: "shift_assignments", permission: "production.read", orderBy: "created_at" },

  // Equipment
  { table: "equipment", permission: "equipment.read", orderBy: "created_at" },
  { table: "equipment_assignments", permission: "equipment.read", orderBy: "created_at" },
  { table: "equipment_meter_readings", permission: "equipment.read", orderBy: "created_at" },
  { table: "equipment_status_history", permission: "equipment.read", orderBy: "changed_at" },
  { table: "equipment_documents", permission: "equipment.read", orderBy: "created_at" },

  // Production and ore handling
  { table: "production_entries", permission: "production.read", orderBy: "created_at" },
  { table: "production_approvals", permission: "production.read", orderBy: "decided_at" },
  { table: "downtime_records", permission: "production.read", orderBy: "created_at" },
  { table: "ore_lots", permission: "production.read", orderBy: "created_at" },
  { table: "ore_dispatches", permission: "production.read", orderBy: "created_at" },

  // Fuel
  { table: "fuel_storage_locations", permission: "fuel.read", orderBy: "created_at" },
  { table: "fuel_receipts", permission: "fuel.read", orderBy: "created_at" },
  { table: "fuel_issues", permission: "fuel.read", orderBy: "created_at" },
  { table: "fuel_adjustments", permission: "fuel.read", orderBy: "created_at" },
  { table: "fuel_stock_takes", permission: "fuel.read", orderBy: "created_at" },

  // Maintenance
  { table: "maintenance_requests", permission: "maintenance.read", orderBy: "created_at" },
  { table: "maintenance_work_orders", permission: "maintenance.read", orderBy: "created_at" },
  { table: "maintenance_parts", permission: "maintenance.read", orderBy: "created_at" },
  { table: "maintenance_costs", permission: "maintenance.read", orderBy: "created_at" },
  { table: "maintenance_schedules", permission: "maintenance.read", orderBy: "created_at" },

  // Inventory
  { table: "inventory_categories", permission: "inventory.read", orderBy: "created_at" },
  { table: "inventory_items", permission: "inventory.read", orderBy: "created_at" },
  { table: "inventory_locations", permission: "inventory.read", orderBy: "created_at" },
  { table: "inventory_stock_balances", permission: "inventory.read", orderBy: "inventory_item_id" },
  { table: "stock_receipts", permission: "inventory.read", orderBy: "created_at" },
  { table: "stock_issues", permission: "inventory.read", orderBy: "created_at" },
  { table: "stock_transfers", permission: "inventory.read", orderBy: "created_at" },
  { table: "stock_adjustments", permission: "inventory.read", orderBy: "created_at" },
  { table: "inventory_stock_counts", permission: "inventory.read", orderBy: "created_at" },
  { table: "inventory_stock_count_lines", permission: "inventory.read", orderBy: "created_at" },
  { table: "suppliers", permission: "inventory.read", orderBy: "created_at" },

  // Expenses
  { table: "expense_categories", permission: "expense.read", orderBy: "created_at" },
  { table: "expenses", permission: "expense.read", orderBy: "created_at" },
  { table: "expense_approvals", permission: "expense.read", orderBy: "decided_at" },
  { table: "budgets", permission: "expense.read", orderBy: "created_at" },

  // Compliance
  { table: "mineral_licences", permission: "compliance.read", orderBy: "created_at" },
  { table: "compliance_requirements", permission: "compliance.read", orderBy: "created_at" },
  { table: "compliance_tasks", permission: "compliance.read", orderBy: "created_at" },
  { table: "compliance_documents", permission: "compliance.read", orderBy: "created_at" },

  // Safety
  { table: "safety_incidents", permission: "safety.read", orderBy: "created_at" },
  { table: "safety_inspections", permission: "safety.read", orderBy: "created_at" },
  { table: "corrective_actions", permission: "safety.read", orderBy: "created_at" },

  // Geology and forecasting
  { table: "geological_samples", permission: "geology.read", orderBy: "created_at" },
  { table: "geological_assays", permission: "geology.read", orderBy: "created_at" },
  { table: "drill_holes", permission: "geology.read", orderBy: "created_at" },
  { table: "drill_intervals", permission: "geology.read", orderBy: "created_at" },
  { table: "geological_boundaries", permission: "geology.read", orderBy: "created_at" },
  { table: "geological_files", permission: "geology.read", orderBy: "created_at" },
  { table: "site_forecast_assumptions", permission: "production.read", orderBy: "created_at" },

  // The organization's own record of who did what
  { table: "audit_logs", permission: "audit_log.read", orderBy: "created_at" },
  { table: "notifications", permission: "organization.read", orderBy: "created_at" },
];

export const excludedTables: ExcludedTable[] = [
  {
    table: "safety_incident_details",
    reason:
      "Personal and medical detail about named workers. It sits behind its own permission and every "
      + "single read of it is written to the audit log by design. Putting it in a bulk file would "
      + "turn an audited, one-record-at-a-time disclosure into an unaudited copy of everything, "
      + "which is the exact protection the separate table exists to provide. A company that needs it "
      + "can read it through the screen, where each access is recorded.",
  },
];

const exportedNames = new Set(exportedTables.map((entry) => entry.table));
const excludedNames = new Set(excludedTables.map((entry) => entry.table));

/** Whether a table carrying organization_id has been considered at all. Used by the drift test. */
export function isAccountedFor(table: string): boolean {
  return exportedNames.has(table) || excludedNames.has(table);
}

/** Every distinct permission the export consults, for the manifest and for tests. */
export function exportPermissions(): string[] {
  return [...new Set(exportedTables.map((entry) => entry.permission))].sort();
}
