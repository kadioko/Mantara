import { hasPermission } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { fetchAllPages } from "@/features/reports/fetch-all";
import { excludedTables, exportedTables } from "./catalogue";

/**
 * Builds an organization's own copy of its records.
 *
 * The whole value of this file is the manifest. Anyone can dump rows into JSON; what makes the
 * result trustworthy is that it says out loud what it does *not* contain — tables the reader was
 * not allowed to see, tables that hit the row ceiling, tables deliberately withheld. A client who
 * is told "here is all your data" and receives 90% of it with no indication is worse off than one
 * who receives 90% and is handed the list of the other 10%.
 *
 * Site restriction needs no code here. The restrictive policies added by `0028` are enforced by the
 * database against this caller's own session, so a member limited to one pit exports one pit. That
 * is deliberate: filtering in this file would be a second implementation of the boundary, and the
 * two would eventually disagree.
 */

/** Roughly a tenth of the report ceiling per table, because this reads sixty-odd tables at once. */
export const EXPORT_ROW_CEILING = 25_000;

export type TableOutcome =
  | { table: string; rows: number; truncated: boolean }
  | { table: string; withheld: "permission"; permission: string }
  | { table: string; withheld: "policy"; reason: string }
  | { table: string; failed: true };

export interface ExportManifest {
  /** What produced the file, so a support conversation years later can start somewhere. */
  format: "mantara-organization-export";
  formatVersion: 1;
  generatedAt: string;
  organization: { id: string; name: string };
  /** The sites this reader could reach. A restricted member's file covers fewer than the company has. */
  sites: Array<{ id: string; name: string }>;
  exportedBy: string;
  rowCeilingPerTable: number;
  tables: TableOutcome[];
  /** Restated at the top level so nobody has to scan sixty entries to know whether to worry. */
  complete: boolean;
  notes: string[];
}

export interface OrganizationExport {
  manifest: ExportManifest;
  data: Record<string, unknown[]>;
}

export async function runOrganizationExport(): Promise<OrganizationExport | { error: string }> {
  const workspace = await getActiveWorkspace();
  const organization = workspace.activeOrganization;
  if (!organization) return { error: "Select an active organization first." };

  // Reading the organization itself is the floor. Without it there is nothing to export from.
  if (!await hasPermission(organization.id, "organization.read")) {
    return { error: "You do not have permission to export this organization's data." };
  }

  const supabase = workspace.supabase;
  const outcomes: TableOutcome[] = [];
  const data: Record<string, unknown[]> = {};

  // Resolved once rather than per table: sixty tables sharing eleven permissions would otherwise ask
  // the same question sixty times. hasPermission caches per request, but the intent is clearer here.
  const allowed = new Map<string, boolean>();
  for (const { permission } of exportedTables) {
    if (!allowed.has(permission)) allowed.set(permission, await hasPermission(organization.id, permission));
  }

  for (const entry of exportedTables) {
    if (!allowed.get(entry.permission)) {
      // Listed, not omitted. Someone reading the manifest can see there is more and ask for it.
      outcomes.push({ table: entry.table, withheld: "permission", permission: entry.permission });
      continue;
    }

    const paged = await fetchAllPages<Record<string, unknown>>(async (from, to) => {
      const { data: rows, error } = await supabase
        .from(entry.table).select("*")
        .eq("organization_id", organization.id)
        .order(entry.orderBy).order("id")
        .range(from, to);
      return error ? null : rows ?? [];
    }, { ceiling: EXPORT_ROW_CEILING });

    if (paged === null) {
      // One table failing must not cost the other fifty-nine. Recorded, and the file says so.
      outcomes.push({ table: entry.table, failed: true });
      continue;
    }

    data[entry.table] = paged.rows;
    outcomes.push({ table: entry.table, rows: paged.rows.length, truncated: paged.truncated });
  }

  for (const entry of excludedTables) {
    outcomes.push({ table: entry.table, withheld: "policy", reason: entry.reason });
  }

  return {
    manifest: buildManifest(outcomes, {
      organization,
      sites: workspace.sites,
      exportedBy: workspace.user.id,
    }),
    data,
  };
}

/**
 * Separated from the reading so it can be tested without a database — the manifest is the part that
 * has to be right, and it is pure.
 */
export function buildManifest(
  tables: TableOutcome[],
  context: { organization: { id: string; name: string }; sites: Array<{ id: string; name: string }>; exportedBy: string },
): ExportManifest {
  const truncated = tables.filter((entry) => "truncated" in entry && entry.truncated);
  const withheld = tables.filter((entry) => "withheld" in entry && entry.withheld === "permission");
  const failed = tables.filter((entry) => "failed" in entry);
  const notes: string[] = [];

  if (truncated.length > 0) {
    notes.push(
      `${truncated.length} table(s) reached the ${EXPORT_ROW_CEILING.toLocaleString()}-row limit and are `
      + `incomplete: ${truncated.map((entry) => entry.table).join(", ")}. Ask for these separately.`,
    );
  }
  if (withheld.length > 0) {
    notes.push(
      `${withheld.length} table(s) were withheld because the person who ran this export cannot read `
      + `them: ${withheld.map((entry) => entry.table).join(", ")}. An owner would receive them.`,
    );
  }
  if (failed.length > 0) {
    notes.push(
      `${failed.length} table(s) could not be read at all: ${failed.map((entry) => entry.table).join(", ")}. `
      + `This is a fault, not a permission decision — please report it.`,
    );
  }
  notes.push(
    "This file covers only the mine sites the person who ran it may reach. A company whose members "
    + "are restricted to particular sites should run it as an owner to receive everything.",
  );

  return {
    format: "mantara-organization-export",
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    organization: context.organization,
    sites: context.sites,
    exportedBy: context.exportedBy,
    rowCeilingPerTable: EXPORT_ROW_CEILING,
    tables,
    // "Complete" means every table was read in full. A deliberate exclusion does not make the file
    // incomplete — it is stated policy, and its reason travels in the manifest.
    complete: truncated.length === 0 && withheld.length === 0 && failed.length === 0,
    notes,
  };
}

/** A filename somebody can find again in six months. */
export function exportFileName(organizationName: string, when = new Date()): string {
  const safe = organizationName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `mantara-${safe || "organization"}-${when.toISOString().slice(0, 10)}.json`;
}
