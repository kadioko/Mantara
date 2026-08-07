import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { log, logError, logInfo, logged } from "@/lib/observability/log";

const captured: { stream: string; line: string }[] = [];
const originalLevel = process.env.LOG_LEVEL;

beforeEach(() => {
  captured.length = 0;
  for (const stream of ["log", "warn", "error"] as const) {
    vi.spyOn(console, stream).mockImplementation((line: unknown) => {
      captured.push({ stream, line: String(line) });
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalLevel === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = originalLevel;
});

const parsed = () => captured.map((entry) => JSON.parse(entry.line) as Record<string, unknown>);

describe("log lines", () => {
  it("writes one line of JSON with the level and a timestamp", () => {
    logInfo({ event: "production.entry.created", organizationId: "org-1" });
    expect(captured).toHaveLength(1);
    const [line] = parsed();
    expect(line.level).toBe("info");
    expect(line.event).toBe("production.entry.created");
    expect(line.organizationId).toBe("org-1");
    expect(typeof line.time).toBe("string");
    expect(Number.isNaN(Date.parse(String(line.time)))).toBe(false);
  });

  it("sends errors to stderr and everything else to stdout", () => {
    logInfo({ event: "a" });
    log("warn", { event: "b" });
    logError({ event: "c" });
    expect(captured.map((entry) => entry.stream)).toEqual(["log", "warn", "error"]);
  });

  it("honours LOG_LEVEL", () => {
    process.env.LOG_LEVEL = "warn";
    logInfo({ event: "quiet" });
    expect(captured).toHaveLength(0);
    logError({ event: "loud" });
    expect(captured).toHaveLength(1);
  });
});

describe("what never reaches a log aggregator", () => {
  // Logs are read by more people than the database is. An operator's name, a worker's phone number,
  // or a tonnage figure has no business in one, whatever a call site passes.
  it("redacts personal and operational fields by name", () => {
    logInfo({
      event: "worker.created",
      organizationId: "org-1",
      fullName: "A real person",
      phone: "+255700000000",
      email: "someone@example.com",
      notes: "medical detail",
      tonnes: 250,
    });
    const [line] = parsed();
    expect(line.organizationId).toBe("org-1");
    for (const field of ["fullName", "phone", "email", "notes", "tonnes"]) {
      expect(line[field], field).toBe("[redacted]");
    }
    expect(captured[0].line).not.toContain("A real person");
    expect(captured[0].line).not.toContain("255700000000");
  });

  it("truncates a long string rather than dumping it", () => {
    logInfo({ event: "x", payload: "y".repeat(500) });
    const [line] = parsed();
    expect(String(line.payload).length).toBeLessThan(220);
    expect(String(line.payload).endsWith("…")).toBe(true);
  });
});

describe("logged()", () => {
  it("returns the result and records how long it took", async () => {
    const result = await logged("report.export", { organizationId: "org-1" }, async () => 42);
    expect(result).toBe(42);
    const [line] = parsed();
    expect(line.outcome).toBe("ok");
    expect(typeof line.durationMs).toBe("number");
  });

  it("records the failure and rethrows, so the caller still handles it", async () => {
    await expect(
      logged("report.export", { organizationId: "org-1" }, async () => {
        throw new Error("connection reset");
      }),
    ).rejects.toThrow("connection reset");
    const [line] = parsed();
    expect(line.level).toBe("error");
    expect(line.outcome).toBe("failed");
    expect(line.message).toBe("connection reset");
  });

  it("does not let context overwrite the fields it is responsible for", async () => {
    await logged("real.event", { event: "spoofed", outcome: "ok" } as never, async () => null);
    const [line] = parsed();
    expect(line.event).toBe("real.event");
  });
});
