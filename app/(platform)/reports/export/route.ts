import { NextResponse, type NextRequest } from "next/server";
import { isReportKind, runReport, toCsv } from "@/features/reports/queries";
import { rateLimitMessage, withinRateLimit } from "@/lib/auth/rate-limit";

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

  if (!await withinRateLimit("report.export")) {
    return NextResponse.json({ error: await rateLimitMessage("report.export") }, { status: 429 });
  }

  const result = await runReport(kind, from, to);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 403 });

  return new NextResponse(toCsv(result), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mantara-${kind}-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
      // The proxy sets this on every response, and it is set again here on purpose. This body is
      // text an operator typed, served from our own origin; a browser that decided it looked like
      // HTML would run it with the session attached. That is too much to rest on a header applied
      // by a layer this route has no test coverage over — /api/health shipped broken for exactly
      // that reason, because every test exercised the handler and none exercised the path in front.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
