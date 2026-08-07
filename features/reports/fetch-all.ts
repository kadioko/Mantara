/**
 * Reads a whole result set in pages.
 *
 * PostgREST caps a single response at 1000 rows and says nothing about it. A report built from one
 * unbounded `select` therefore stops at 1000 and looks complete — a year of production downloaded
 * for a royalty return would simply be short. That is the worst shape a bug can take: no error, no
 * empty screen, just a smaller number than the truth.
 *
 * So: page until a short page arrives, and stop at a ceiling. The ceiling exists because a report
 * with no upper bound is a way to exhaust the server, and because nobody reads a 200,000-row CSV —
 * they narrow the date range. When it is reached the caller is told, and passes that on.
 */
export const REPORT_PAGE_SIZE = 1000;
export const REPORT_ROW_CEILING = 50_000;

export type PagedResult<Row> = { rows: Row[]; truncated: boolean };

/**
 * `fetchPage` receives an inclusive range and returns that slice, or null if the query failed.
 * Returning null aborts rather than silently yielding a partial report.
 */
export async function fetchAllPages<Row>(
  fetchPage: (from: number, to: number) => Promise<Row[] | null>,
  { pageSize = REPORT_PAGE_SIZE, ceiling = REPORT_ROW_CEILING } = {},
): Promise<PagedResult<Row> | null> {
  const rows: Row[] = [];

  while (rows.length < ceiling) {
    // Never ask for more than the ceiling allows, so the last page cannot overshoot it.
    const wanted = Math.min(pageSize, ceiling - rows.length);
    const page = await fetchPage(rows.length, rows.length + wanted - 1);
    if (page === null) return null;
    rows.push(...page);

    // A short page means the end of the data. A full page means there may be more.
    if (page.length < wanted) return { rows, truncated: false };
  }

  // Exactly at the ceiling. It may or may not be the true end, and we cannot tell without asking
  // again, so say truncated rather than claim a completeness we have not established.
  return { rows, truncated: true };
}
