import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportedTables } from "@/features/exports/catalogue";

/**
 * What a particular reader actually receives.
 *
 * The manifest builder is pure and tested separately; the database policies are tested against a
 * real PostgreSQL. This is the piece between them — the one that decides *withheld* versus *failed*
 * versus *truncated* — and it had no test at all. That gap matters more than it sounds, because the
 * three outcomes are indistinguishable to a client if the code puts a table in the wrong one: a
 * table they are not allowed to see and a table we failed to read both come back absent, and only
 * the label tells them whether to talk to their owner or report a bug.
 *
 * Supabase and the permission lookup are replaced. `fetchAllPages` is deliberately **not** — the
 * ceiling behaviour is half of what is under test here.
 */

const state = vi.hoisted(() => ({
  /** Permissions this reader holds. */
  granted: new Set<string>(),
  /** Tables that should fail when read, as a query error would. */
  failing: new Set<string>(),
  /** Tables that return full pages for ever, so the row ceiling is reached. */
  endless: new Set<string>(),
  /** Every table actually queried, so a test can assert one was never touched. */
  queried: [] as string[],
  sites: [{ id: "site-1", name: "Pit One" }],
  organization: { id: "org-1", name: "Acme Mining" } as { id: string; name: string } | null,
}));

vi.mock("@/lib/auth/permissions", () => ({
  hasPermission: async (_organizationId: string, code: string) => state.granted.has(code),
}));

vi.mock("@/lib/auth/workspace", () => ({
  getActiveWorkspace: async () => ({
    user: { id: "user-1" },
    activeOrganization: state.organization,
    sites: state.sites,
    supabase: {
      from(table: string) {
        state.queried.push(table);
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          range: (from: number, to: number) => {
            if (state.failing.has(table)) {
              return Promise.resolve({ data: null, error: { message: "boom" } });
            }
            // A full page means "there may be more"; a short one ends the paging.
            const wanted = to - from + 1;
            const rows = state.endless.has(table)
              ? Array.from({ length: wanted }, (_, index) => ({ id: `${table}-${from + index}` }))
              : [{ id: `${table}-1` }, { id: `${table}-2` }];
            return Promise.resolve({ data: rows, error: null });
          },
        };
        return chain;
      },
    },
  }),
}));

const { runOrganizationExport, EXPORT_ROW_CEILING } = await import("@/features/exports/run");

/** Everything an owner holds. */
const allPermissions = () => new Set(exportedTables.map((entry) => entry.permission).concat("organization.read"));

const outcomeFor = (manifestTables: Awaited<ReturnType<typeof runOrganizationExport>>, table: string) => {
  if ("error" in manifestTables) throw new Error("expected an export, got an error");
  return manifestTables.manifest.tables.find((entry) => entry.table === table);
};

const run = async () => {
  const result = await runOrganizationExport();
  if ("error" in result) throw new Error(`expected an export, got: ${result.error}`);
  return result;
};

beforeEach(() => {
  state.granted = allPermissions();
  state.failing = new Set();
  state.endless = new Set();
  state.queried = [];
  state.organization = { id: "org-1", name: "Acme Mining" };
  state.sites = [{ id: "site-1", name: "Pit One" }];
});

describe("an owner who can read everything", () => {
  it("receives every table in the catalogue", async () => {
    const result = await run();
    expect(Object.keys(result.data).sort()).toEqual(exportedTables.map((entry) => entry.table).sort());
    expect(result.manifest.complete).toBe(true);
  });

  it("still has the withheld table listed, with its reason", async () => {
    // Not conditional on permission — it is policy, and an owner is told about it too.
    const outcome = outcomeFor(await run(), "safety_incident_details");
    expect(outcome).toMatchObject({ withheld: "policy" });
    expect((outcome as { reason: string }).reason).toContain("audit log");
    expect(Object.keys((await run()).data)).not.toContain("safety_incident_details");
  });

  it("asks about each permission once, not once per table", async () => {
    // Sixty-three tables share eleven permissions. Sixty-three lookups would be sixty-three round
    // trips on the one request that already reads the whole database.
    const asked: string[] = [];
    const permissions = await import("@/lib/auth/permissions");
    vi.spyOn(permissions, "hasPermission").mockImplementation(async (_organizationId: string, code: string) => {
      asked.push(code);
      return state.granted.has(code);
    });

    await run();
    // Asserted first, and deliberately: if the spy never intercepted anything, `asked` is empty and
    // every comparison below passes while proving nothing. A test that cannot fail is worse than no
    // test, because it occupies the space where the real one would go.
    expect(asked.length).toBeGreaterThan(5);
    expect(new Set(asked).size).toBeLessThan(exportedTables.length);
    // organization.read is asked separately, before the loop, so it appears twice at most.
    expect(asked.length).toBeLessThanOrEqual(new Set(asked).size + 1);
    vi.restoreAllMocks();
  });
});

describe("a reader who cannot see a module", () => {
  beforeEach(() => {
    state.granted = allPermissions();
    state.granted.delete("expense.read");
  });

  it("gets those tables listed as withheld rather than quietly absent", async () => {
    const result = await run();
    for (const table of ["expenses", "expense_categories", "expense_approvals", "budgets"]) {
      expect(outcomeFor(result, table), table).toMatchObject({ withheld: "permission", permission: "expense.read" });
    }
  });

  it("does not call the export complete", async () => {
    // The trap this exists to close: a file that says complete and is missing a module.
    const result = await run();
    expect(result.manifest.complete).toBe(false);
    expect(result.manifest.notes.join(" ")).toContain("expenses");
  });

  it("never queries the tables it may not return", async () => {
    // Reading rows we have already decided not to hand over would put them in this process's memory
    // and in any query log, for nothing. RLS would very likely refuse anyway — but "very likely" is
    // not the standard for the request that reads the whole database.
    await run();
    for (const table of ["expenses", "expense_categories", "expense_approvals", "budgets"]) {
      expect(state.queried, table).not.toContain(table);
    }
  });

  it("still returns every other module in full", async () => {
    const result = await run();
    expect(result.data.production_entries).toHaveLength(2);
    expect(result.data.workers).toHaveLength(2);
    expect(Object.keys(result.data)).toHaveLength(exportedTables.length - 4);
  });
});

describe("when a table cannot be read at all", () => {
  beforeEach(() => { state.failing = new Set(["fuel_issues"]); });

  it("records it as a fault, not as a permission decision", async () => {
    // Different responses from the reader: one is a conversation with their owner, the other is a
    // bug report to us. Conflating them sends people to the wrong place.
    const result = await run();
    expect(outcomeFor(result, "fuel_issues")).toEqual({ table: "fuel_issues", failed: true });
    expect(result.manifest.notes.join(" ")).toMatch(/fault, not a permission decision/i);
  });

  it("does not cost the other sixty-two tables", async () => {
    // The whole file failing because one table did would turn a recoverable fault into no export.
    const result = await run();
    expect(Object.keys(result.data)).toHaveLength(exportedTables.length - 1);
    expect(result.data.production_entries).toHaveLength(2);
  });

  it("does not call the export complete", async () => {
    expect((await run()).manifest.complete).toBe(false);
  });
});

describe("when a table is larger than the export will carry", () => {
  beforeEach(() => { state.endless = new Set(["production_entries"]); });

  it("stops at the ceiling and says which table was cut", async () => {
    const result = await run();
    expect(outcomeFor(result, "production_entries")).toEqual({
      table: "production_entries", rows: EXPORT_ROW_CEILING, truncated: true,
    });
    expect(result.manifest.notes.join(" ")).toContain("production_entries");
    expect(result.manifest.complete).toBe(false);
  });

  it("leaves every other table untouched by the cut", async () => {
    const result = await run();
    expect(result.data.workers).toHaveLength(2);
  });
}, 60_000);

describe("when the export cannot be produced at all", () => {
  it("refuses without an active organization", async () => {
    state.organization = null;
    const result = await runOrganizationExport();
    expect(result).toEqual({ error: expect.stringContaining("organization") });
  });

  it("refuses a reader who cannot even read the organization", async () => {
    // A partial export is for someone who is entitled to *something*. Without organization.read
    // there is no entitlement at all, so this refuses rather than returning an empty file — which
    // would otherwise read as "your company has no data".
    state.granted = new Set();
    const result = await runOrganizationExport();
    expect(result).toEqual({ error: expect.stringContaining("permission") });
  });
});
