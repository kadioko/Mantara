import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/csp-report/route";

/**
 * The collector for Content-Security-Policy violations.
 *
 * These tests call the exported handler with a real Request, and assert on the status of the
 * Response it returns — not on a parser extracted from it. The first version of this route answered
 * 500 to every report because `NextResponse.json` refuses to build a 204, and a test of the parsing
 * alone would have passed: the parsing was correct. A report channel that silently 500s is worse
 * than none, because the quiet reads as a clean policy.
 */

const post = (body: string, contentType: string) =>
  POST(new Request("https://mantara.example/api/csp-report", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  }) as never);

const legacy = JSON.stringify({
  "csp-report": {
    "document-uri": "https://mantara.example/production/abc-123?q=gold%20ore",
    "violated-directive": "script-src",
    "effective-directive": "script-src",
    "blocked-uri": "https://evil.example/x.js",
    "script-sample": "alert(1)",
  },
});

const modern = JSON.stringify([{
  type: "csp-violation",
  body: { documentURL: "https://mantara.example/workers/xyz", effectiveDirective: "img-src", blockedURL: "https://cdn.evil/x.png" },
}]);

let lines: string[];

beforeEach(() => {
  lines = [];
  vi.spyOn(console, "warn").mockImplementation((line: unknown) => { lines.push(String(line)); });
});

afterEach(() => { vi.restoreAllMocks(); });

describe("answering the browser", () => {
  it("accepts a report with 204 and no body", async () => {
    const response = await post(legacy, "application/csp-report");
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("answers the same to a body it cannot read", async () => {
    // A prober must not be able to tell a report that was understood from one that was not.
    for (const [body, type] of [["not json", "application/csp-report"], ["{}", "application/reports+json"], ["x", "text/plain"]]) {
      expect((await post(body, type)).status, `${type}: ${body}`).toBe(204);
    }
  });

  it("refuses a body large enough to be an attempt at the log", async () => {
    const response = await post(JSON.stringify({ "csp-report": { "blocked-uri": "x".repeat(20_000) } }), "application/csp-report");
    expect(response.status).toBe(204);
    expect(lines).toHaveLength(0);
  });
});

describe("what reaches the log", () => {
  it("records which directive and what was blocked", async () => {
    await post(legacy, "application/csp-report");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("csp.violation");
    expect(lines[0]).toContain("script-src");
    expect(lines[0]).toContain("https://evil.example/x.js");
  });

  it("reads the shape Chrome sends as well as the one Firefox sends", async () => {
    await post(modern, "application/reports+json");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("img-src");
  });

  it("keeps the query string of the page out of it", async () => {
    // The path names a record, which is an identifier and is fine. A query string is where a search
    // term or a filter lives, and that is operator data — it does not belong in a log at all.
    await post(legacy, "application/csp-report");
    expect(lines[0]).toContain("/production/abc-123");
    expect(lines[0]).not.toContain("gold");
  });

  it("writes nothing at all for a body that is not a report", async () => {
    await post(JSON.stringify({ hello: "world" }), "application/csp-report");
    expect(lines).toHaveLength(0);
  });

  it("ignores an entry in the array that is not a violation", async () => {
    await post(JSON.stringify([{ type: "deprecation", body: { id: "x" } }]), "application/reports+json");
    expect(lines).toHaveLength(0);
  });
});
