/**
 * The figures the geology screen shows, worked out where they can be tested.
 *
 * They used to be inline in the page as one-line expressions, and three of them were wrong in ways
 * nothing would report: a drill hole with no intervals produced `-Infinity`, which reached the map
 * tooltip as "HOLE-001 · -Infinity PPM"; the sample table showed the *oldest* assay for each sample
 * rather than the newest; and the highest-grade claim was computed from a capped page of rows while
 * being presented as the highest on site.
 *
 * None of that is exotic. It is what happens when arithmetic lives inside JSX, where no test can
 * reach it. Hence this file.
 */

export interface AssayRow { sample_id: string; value_ppm: number | string | null; tested_on: string }
export interface IntervalRow { drill_hole_id: string; grade_ppm: number | string | null }

/**
 * The most recent assay for each sample.
 *
 * The page reads assays newest-first, and the previous code built a Map straight from that order.
 * A Map keeps the *last* value written for a key, so the survivor was the oldest assay in the list —
 * exactly backwards. For a sample re-tested after a disputed result, the screen showed the result
 * that was superseded.
 *
 * Written to be independent of the caller's ordering rather than relying on it, because the next
 * person to add `.order()` to that query should not be able to change which number an operator sees.
 */
export function latestAssayBySample(assays: AssayRow[]): Map<string, AssayRow> {
  const latest = new Map<string, AssayRow>();
  for (const assay of assays) {
    const held = latest.get(assay.sample_id);
    if (!held || assay.tested_on > held.tested_on) latest.set(assay.sample_id, assay);
  }
  return latest;
}

/** Any finite number, or null. Guards every figure below against NaN and infinity reaching a screen. */
const finite = (value: number): number | null => (Number.isFinite(value) ? value : null);

/**
 * A recorded measurement, or null when there was none.
 *
 * `Number(null)` is `0`, and `Number("")` is `0`. Coercing straight from the column therefore turns
 * "this interval was logged but never assayed" into "this interval assayed at zero" — a measurement
 * that was never taken, presented as a result. It survives a maximum unharmed and corrupts the
 * moment anyone averages or counts these, which is exactly the sort of thing that gets added later.
 */
const reading = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") return null;
  return finite(Number(value));
};

/**
 * The best grade recorded down one hole, or null when nothing was.
 *
 * `Math.max()` of an empty list is `-Infinity`, and `-Infinity` is truthy — so the previous
 * `Math.max(...grades) || null` returned `-Infinity` for every hole that had no intervals yet,
 * which is most of them while drilling is still in progress.
 */
export function holeGrade(intervals: IntervalRow[]): number | null {
  const grades = intervals
    .map((interval) => reading(interval.grade_ppm))
    .filter((grade): grade is number => grade !== null);
  return grades.length ? finite(Math.max(...grades)) : null;
}

export function intervalsByHole(intervals: IntervalRow[]): Map<string, IntervalRow[]> {
  const byHole = new Map<string, IntervalRow[]>();
  for (const interval of intervals) {
    byHole.set(interval.drill_hole_id, [...(byHole.get(interval.drill_hole_id) ?? []), interval]);
  }
  return byHole;
}

/**
 * The highest grade among the rows the screen is holding, and how many it looked at.
 *
 * `sampled` is returned so the caller can say *of what*. The screen reads a page of assays and
 * intervals, not all of them, so "highest grade on site" was a claim the data could not support —
 * a richer result outside the page would simply not be mentioned.
 */
export function highestGrade(assays: AssayRow[], intervals: IntervalRow[]): { grade: number | null; sampled: number } {
  const grades = [
    ...assays.map((assay) => reading(assay.value_ppm)),
    ...intervals.map((interval) => reading(interval.grade_ppm)),
  ].filter((grade): grade is number => grade !== null);
  return { grade: grades.length ? finite(Math.max(...grades)) : null, sampled: grades.length };
}
