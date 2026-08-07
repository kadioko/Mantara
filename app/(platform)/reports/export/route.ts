import { NextResponse, type NextRequest } from "next/server";
import { isReportKind, runReport, toCsv } from "@/features/reports/queries";

/**
 * Serves the same query the report screen shows, as a download. Permission and tenant scope are
 * checked inside runReport, so a hand-crafted URL cannot export another organization's records.
 */
export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind") ?? undefined;
  const from = request.nextUrl.searchParams.get("from") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? "";
  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

  if (!isReportKind(kind) || !isDate(from) || !isDate(to)) {
    return NextResponse.json({ error: "Provide a valid report and date range." }, { status: 400 });
  }

  const result = await runReport(kind, from, to);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 403 });

  return new NextResponse(toCsv(result), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mantara-${kind}-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
