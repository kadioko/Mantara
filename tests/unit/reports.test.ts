import { describe, expect, it, vi } from "vitest";
import { REPORT_PAGE_SIZE, fetchAllPages } from "@/features/reports/fetch-all";
import { csvCell, toCsv } from "@/features/reports/csv";

/** A fake result set that answers range requests the way PostgREST does. */
const source = (total: number) => {
  const all = Array.from({ length: total }, (_, index) => ({ id: index }));
  return vi.fn(async (from: number, to: number) => all.slice(from, to + 1));
};

describe("reading a whole result set", () => {
  it("returns everything when it fits in one page", async () => {
    const fetchPage = source(10);
    const result = await fetchAllPages(fetchPage, { pageSize: 100 });
    expect(result?.rows).toHaveLength(10);
    expect(result?.truncated).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("keeps asking until a short page arrives", async () => {
    const fetchPage = source(250);
    const result = await fetchAllPages(fetchPage, { pageSize: 100 });
    expect(result?.rows).toHaveLength(250);
    expect(result?.truncated).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("asks once more when the data ends exactly on a page boundary", async () => {
    // 200 rows in pages of 100 gives two full pages. Stopping there would be a guess; the third
    // request is what establishes there is nothing after it.
    const fetchPage = source(200);
    const result = await fetchAllPages(fetchPage, { pageSize: 100 });
    expect(result?.rows).toHaveLength(200);
    expect(result?.truncated).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("requests contiguous, non-overlapping ranges", async () => {
    // An off-by-one here would duplicate or drop a row per page, which in a production report is a
    // wrong tonnage that nothing else would reveal.
    const fetchPage = source(250);
    await fetchAllPages(fetchPage, { pageSize: 100 });
    expect(fetchPage.mock.calls).toEqual([[0, 99], [100, 199], [200, 299]]);
  });

  it("returns every row exactly once", async () => {
    const result = await fetchAllPages(source(250), { pageSize: 100 });
    const ids = (result?.rows ?? []).map((row) => (row as { id: number }).id);
    expect(new Set(ids).size).toBe(250);
    expect(ids[0]).toBe(0);
    expect(ids[249]).toBe(249);
  });

  it("stops at the ceiling and says so", async () => {
    const result = await fetchAllPages(source(10_000), { pageSize: 100, ceiling: 250 });
    expect(result?.rows).toHaveLength(250);
    expect(result?.truncated).toBe(true);
  });

  it("never overshoots the ceiling on the last page", async () => {
    const fetchPage = source(10_000);
    await fetchAllPages(fetchPage, { pageSize: 100, ceiling: 250 });
    expect(fetchPage.mock.calls.at(-1)).toEqual([200, 249]);
  });

  it("aborts rather than returning a partial report when a page fails", async () => {
    // Half a report presented as a whole one is the exact failure this file exists to prevent.
    let call = 0;
    const result = await fetchAllPages(async (from, to) => {
      call += 1;
      return call === 2 ? null : Array.from({ length: to - from + 1 }, (_, index) => ({ id: from + index }));
    }, { pageSize: 100 });
    expect(result).toBeNull();
  });

  it("handles an empty result set", async () => {
    const result = await fetchAllPages(source(0), { pageSize: 100 });
    expect(result).toEqual({ rows: [], truncated: false });
  });

  it("defaults to PostgREST's own cap as the page size", () => {
    expect(REPORT_PAGE_SIZE).toBe(1000);
  });
});

describe("CSV escaping", () => {
  it("leaves ordinary values alone", () => {
    expect(csvCell("Drill bit")).toBe("Drill bit");
    expect(csvCell(42)).toBe("42");
    expect(csvCell(null)).toBe("");
  });

  it("quotes separators, quotes and newlines", () => {
    expect(csvCell("Diesel, 20L")).toBe('"Diesel, 20L"');
    expect(csvCell('He said "stop"')).toBe('"He said ""stop"""');
    expect(csvCell("line one\r\nline two")).toBe('"line one\r\nline two"');
  });

  it("neutralises a value a spreadsheet would run as a formula", () => {
    // Every one of these is a note or a name an operator could type. Opened in Excel they execute.
    for (const dangerous of ["=1+1", "+SUM(A1)", "-2+3", "@SUM(A1)", "=cmd|'/c calc'!A1"]) {
      const cell = csvCell(dangerous);
      expect(cell.replace(/^"/, "").startsWith("'"), dangerous).toBe(true);
    }
  });

  it("still quotes a formula that also contains a separator", () => {
    expect(csvCell("=A1,B2")).toBe(`"'=A1,B2"`);
  });

  it("leaves negative numbers as numbers", () => {
    // A loss, a write-off and a negative variance all begin with a minus. Guarding them would make
    // the column text, and a column of text does not sum — breaking the totals in the very report
    // the formula guard exists to protect.
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(-12.5)).toBe("-12.5");
    expect(csvCell("-5")).toBe("-5");
    expect(csvCell("-0.001")).toBe("-0.001");
  });

  it("still guards something that only looks numeric at the front", () => {
    expect(csvCell("-5+cmd")).toBe("'-5+cmd");
  });
});

describe("the CSV file", () => {
  const result = {
    columns: ["Date", "Quantity"],
    rows: [{ Date: "2026-01-01", Quantity: 10 }, { Date: "2026-01-02", Quantity: 20 }],
    truncated: false,
  };

  it("writes a header and one line per row", () => {
    expect(toCsv(result)).toBe("Date,Quantity\r\n2026-01-01,10\r\n2026-01-02,20");
  });

  it("carries the truncation warning into the file itself", () => {
    // The screen that produced the file is not there when someone opens it a week later.
    const csv = toCsv({ ...result, truncated: true });
    expect(csv).toContain("truncated");
    expect(csv.split("\r\n")).toHaveLength(5); // header, two rows, blank, warning
  });

  it("fills a missing column rather than shifting the row", () => {
    const csv = toCsv({ columns: ["Date", "Quantity"], rows: [{ Date: "2026-01-01" }], truncated: false });
    expect(csv).toBe("Date,Quantity\r\n2026-01-01,");
  });
});
