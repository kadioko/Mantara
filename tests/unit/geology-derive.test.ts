import { describe, expect, it } from "vitest";
import { highestGrade, holeGrade, intervalsByHole, latestAssayBySample } from "@/features/geology/derive";

/**
 * Each of these was a live defect on the geology screen. They are kept as tests rather than fixed
 * quietly because all three shared one cause: the arithmetic lived inside JSX, where nothing could
 * reach it, and a wrong number on a mining screen looks exactly like a right one.
 */

describe("which assay a sample shows", () => {
  const assay = (sample: string, value: number, tested_on: string) => ({ sample_id: sample, value_ppm: value, tested_on });

  it("shows the most recent one", () => {
    // It showed the oldest. The page reads assays newest-first and built a Map from that order, and
    // a Map keeps the last value written — so the survivor was the one furthest in the past. For a
    // sample re-tested after a disputed result, the screen showed the superseded figure.
    const latest = latestAssayBySample([
      assay("s1", 9.9, "2026-08-01"),
      assay("s1", 1.1, "2026-01-01"),
    ]);
    expect(latest.get("s1")?.value_ppm).toBe(9.9);
  });

  it("does not depend on the order the caller happened to read them in", () => {
    // The fix must not be "rely on the query's ORDER BY", because the next person to change that
    // query would silently change which number an operator is shown.
    const ascending = latestAssayBySample([assay("s1", 1.1, "2026-01-01"), assay("s1", 9.9, "2026-08-01")]);
    expect(ascending.get("s1")?.value_ppm).toBe(9.9);
  });

  it("keeps samples apart", () => {
    const latest = latestAssayBySample([assay("s1", 1, "2026-01-01"), assay("s2", 2, "2026-01-01")]);
    expect(latest.size).toBe(2);
  });
});

describe("the best grade down a hole", () => {
  const interval = (grade: number | string | null) => ({ drill_hole_id: "h1", grade_ppm: grade });

  it("is null when the hole has no intervals yet", () => {
    // Math.max() of nothing is -Infinity, and -Infinity is truthy, so `|| null` did not catch it.
    // The map tooltip read "HOLE-001 · -Infinity PPM" for every hole still being drilled.
    expect(holeGrade([])).toBeNull();
  });

  it("is null when every interval was logged without a grade", () => {
    expect(holeGrade([interval(null), interval(null)])).toBeNull();
  });

  it("is the highest of the graded intervals", () => {
    expect(holeGrade([interval(2), interval(11.5), interval(0.4)])).toBe(11.5);
  });

  it("ignores an ungraded interval rather than reading it as zero", () => {
    // Counting a blank as 0 would be harmless for a maximum but wrong the moment anyone averages
    // these, and it is the same mistake either way: a missing measurement is not a measurement of 0.
    expect(holeGrade([interval(null), interval(3)])).toBe(3);
  });

  it("never returns a value that is not a number", () => {
    for (const grades of [[interval("")], [interval("abc")], [interval(null)], []]) {
      const result = holeGrade(grades);
      expect(result === null || Number.isFinite(result)).toBe(true);
    }
  });
});

describe("grouping intervals", () => {
  it("keeps each hole's intervals together", () => {
    const byHole = intervalsByHole([
      { drill_hole_id: "h1", grade_ppm: 1 },
      { drill_hole_id: "h2", grade_ppm: 2 },
      { drill_hole_id: "h1", grade_ppm: 3 },
    ]);
    expect(byHole.get("h1")).toHaveLength(2);
    expect(byHole.get("h2")).toHaveLength(1);
  });

  it("returns nothing for a hole with none", () => {
    expect(intervalsByHole([]).get("h1")).toBeUndefined();
  });
});

describe("the highest grade the screen can honestly claim", () => {
  it("reports how many readings it looked at", () => {
    // The screen holds a page of assays and intervals, not all of them. "Highest grade on site" was
    // a claim the data could not support — a richer result outside that page would simply not be
    // mentioned. Returning the count lets the screen say "highest of the N shown".
    const result = highestGrade([{ sample_id: "s1", value_ppm: 4, tested_on: "2026-01-01" }], [{ drill_hole_id: "h1", grade_ppm: 9 }]);
    expect(result).toEqual({ grade: 9, sampled: 2 });
  });

  it("is null with nothing to go on, rather than zero", () => {
    // Zero is a claim: "we looked and there is no gold". Null is the truth: we have no reading.
    expect(highestGrade([], [])).toEqual({ grade: null, sampled: 0 });
  });

  it("does not count unreadable values towards the sample size", () => {
    const result = highestGrade([{ sample_id: "s1", value_ppm: null, tested_on: "2026-01-01" }], []);
    expect(result).toEqual({ grade: null, sampled: 0 });
  });
});
