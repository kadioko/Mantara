import type { ReportResult } from "./queries";

/**
 * Characters that make a spreadsheet treat a cell as a formula rather than text.
 *
 * A worker whose name is recorded as `=cmd|'/c calc'!A1`, or a note beginning with `+`, becomes an
 * executable formula the moment someone opens the export in Excel or LibreOffice. The data is
 * operator-supplied and the file is emailed around, so this is not theoretical. Prefixing with an
 * apostrophe is the standard remedy: the spreadsheet shows the original text and evaluates nothing.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * A negative amount is a number, not a formula. Guarding every leading minus would turn each loss,
 * write-off and negative variance into spreadsheet *text*, and a column of text does not sum — which
 * would break the totals in the very report the guard is meant to protect.
 */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/** Escapes one value for CSV: separators, quotes, newlines, and spreadsheet formulas. */
export function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  const needsGuard = typeof value !== "number" && FORMULA_LEAD.test(text) && !PLAIN_NUMBER.test(text);
  const safe = needsGuard ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(result: ReportResult) {
  const header = result.columns.map(csvCell).join(",");
  const body = result.rows.map((row) => result.columns.map((column) => csvCell(row[column] ?? "")).join(","));
  const lines = [header, ...body];
  if (result.truncated) {
    // Said in the file itself, not only on the screen that produced it. A CSV outlives the page it
    // came from, and a report that is short without saying so is the failure worth preventing.
    lines.push("");
    lines.push(csvCell(`Report truncated at ${result.rows.length} rows. Narrow the date range to see the rest.`));
  }
  return lines.join("\r\n");
}
