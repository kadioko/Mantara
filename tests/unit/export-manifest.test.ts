import { describe, expect, it } from "vitest";
import { EXPORT_ROW_CEILING, buildManifest, exportFileName, type TableOutcome } from "@/features/exports/run";

/**
 * The manifest is the part that makes the export trustworthy. Rows are easy; saying out loud what is
 * *missing* from them is what separates "here is your data" from "here is most of your data, and we
 * did not mention it".
 *
 * A client who receives 90% of their records with no indication is worse off than one who receives
 * 90% and is handed the list of the other 10% — the first believes they have everything.
 */

const context = {
  organization: { id: "org-1", name: "Acme Mining" },
  sites: [{ id: "site-1", name: "Pit One" }],
  exportedBy: "user-1",
};

const manifest = (tables: TableOutcome[]) => buildManifest(tables, context);

const ok = (table: string, rows = 10): TableOutcome => ({ table, rows, truncated: false });

describe("when everything was read", () => {
  it("says so plainly", () => {
    expect(manifest([ok("workers"), ok("equipment")]).complete).toBe(true);
  });

  it("still warns that the file only covers the sites the reader could reach", () => {
    // A complete export run by a restricted member is complete *for them* and short for the company.
    // This is the trap: the file says complete and the company assumes it holds everything.
    const notes = manifest([ok("workers")]).notes.join(" ");
    expect(notes).toMatch(/only the mine sites/i);
    expect(notes).toMatch(/owner/i);
  });

  it("names the sites it covered, so the gap is checkable rather than a warning to trust", () => {
    expect(manifest([ok("workers")]).sites).toEqual([{ id: "site-1", name: "Pit One" }]);
  });
});

describe("when something is missing", () => {
  it("is not complete when a table hit the row ceiling", () => {
    const result = manifest([ok("workers"), { table: "production_entries", rows: EXPORT_ROW_CEILING, truncated: true }]);
    expect(result.complete).toBe(false);
    expect(result.notes.join(" ")).toContain("production_entries");
  });

  it("is not complete when a table was withheld for want of permission", () => {
    const result = manifest([ok("workers"), { table: "expenses", withheld: "permission", permission: "expense.read" }]);
    expect(result.complete).toBe(false);
    expect(result.notes.join(" ")).toContain("expenses");
  });

  it("is not complete when a table could not be read at all", () => {
    const result = manifest([ok("workers"), { table: "fuel_issues", failed: true }]);
    expect(result.complete).toBe(false);
    expect(result.notes.join(" ")).toMatch(/fault, not a permission decision/i);
  });

  it("distinguishes a fault from a decision", () => {
    // "You may not have this" and "we could not get this" need different responses from the reader:
    // one is a conversation with their owner, the other is a bug report to us.
    const withheld = manifest([{ table: "expenses", withheld: "permission", permission: "expense.read" }]).notes.join(" ");
    const failed = manifest([{ table: "expenses", failed: true }]).notes.join(" ");
    expect(withheld).toMatch(/cannot read them/i);
    expect(withheld).not.toMatch(/fault/i);
    expect(failed).toMatch(/fault/i);
  });

  it("names every affected table rather than only counting them", () => {
    // "3 tables were incomplete" tells the reader to worry and nothing else.
    const result = manifest([
      { table: "production_entries", rows: 1, truncated: true },
      { table: "fuel_issues", rows: 1, truncated: true },
    ]);
    const notes = result.notes.join(" ");
    expect(notes).toContain("production_entries");
    expect(notes).toContain("fuel_issues");
  });
});

describe("what completeness does and does not mean", () => {
  it("a deliberate exclusion does not make the file incomplete", () => {
    // The withheld safety detail is stated policy, not a gap. Marking the file incomplete for it
    // would cry wolf on every single export and teach people to ignore the flag.
    const result = manifest([ok("workers"), { table: "safety_incident_details", withheld: "policy", reason: "x".repeat(90) }]);
    expect(result.complete).toBe(true);
  });

  it("carries the exclusion and its reason anyway", () => {
    const result = manifest([{ table: "safety_incident_details", withheld: "policy", reason: "Medical detail, audited per read." }]);
    expect(result.tables).toContainEqual({ table: "safety_incident_details", withheld: "policy", reason: "Medical detail, audited per read." });
  });
});

describe("the file itself", () => {
  it("is named so somebody can find it again in six months", () => {
    expect(exportFileName("Acme Mining", new Date("2026-08-11T09:00:00Z"))).toBe("mantara-acme-mining-2026-08-11.json");
  });

  it("survives an organization name that would break a filename", () => {
    const name = exportFileName('Acme / Mining "Co." <TZ>', new Date("2026-08-11T09:00:00Z"));
    expect(name).toBe("mantara-acme-mining-co-tz-2026-08-11.json");
    expect(name).not.toMatch(/[/\\<>":]/);
  });

  it("still produces a name when nothing usable is left of the organization's", () => {
    expect(exportFileName("///", new Date("2026-08-11T09:00:00Z"))).toBe("mantara-organization-2026-08-11.json");
  });

  it("records the format and its version, so a file can still be read years later", () => {
    const result = manifest([ok("workers")]);
    expect(result.format).toBe("mantara-organization-export");
    expect(result.formatVersion).toBe(1);
    expect(result.rowCeilingPerTable).toBe(EXPORT_ROW_CEILING);
  });
});
