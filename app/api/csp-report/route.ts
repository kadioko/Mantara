import { NextResponse, type NextRequest } from "next/server";
import { logWarn } from "@/lib/observability/log";

/**
 * Where a browser posts what the Content-Security-Policy would have blocked.
 *
 * The policy ships report-only, so nothing here is a page that broke — each line is a page that
 * *would* have broken, which is exactly the list needed before the policy can be made enforcing.
 * Reports land in the ordinary log stream alongside everything else, so no second place to look.
 *
 * It has to be anonymous: a blocked resource is reported by the browser with no credentials, and a
 * report that needed a session would only ever arrive from pages that were working anyway.
 */
export const dynamic = "force-dynamic";

/** Enough for any genuine report and small enough that shouting at this endpoint achieves nothing. */
const maxBodyBytes = 16_384;

/** The two shapes browsers actually send. Firefox sends the first; Chrome sends the second. */
type LegacyReport = { "csp-report"?: Record<string, unknown> };
type ModernReport = { type?: string; body?: Record<string, unknown> };

const text = (value: unknown) => (typeof value === "string" ? value : undefined);

/**
 * A page URL with the query removed.
 *
 * The path names a record — /production/<uuid> — and an identifier in a log is fine and is what
 * makes an incident traceable. A query string is where a search term or a filter would be, and
 * those are operator data, which does not belong in a log at all.
 */
function pagePath(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return raw.split("?")[0];
  }
}

function record(fields: Record<string, unknown>) {
  logWarn({
    event: "csp.violation",
    directive: text(fields["effective-directive"] ?? fields.effectiveDirective ?? fields["violated-directive"]),
    blocked: pagePath(fields["blocked-uri"] ?? fields.blockedURL),
    page: pagePath(fields["document-uri"] ?? fields.documentURL),
    // Capped by the specification at a short prefix, and truncated again by the logger. Enough to
    // recognise which script it was, never enough to reconstruct one.
    sample: text(fields["script-sample"] ?? fields.sample)?.slice(0, 120),
    disposition: text(fields.disposition),
  });
}

export async function POST(request: NextRequest) {
  // Always 204, whatever happened. A browser cannot act on an error here, and a prober should learn
  // nothing from the difference between a report that was understood and one that was not.
  //
  // Built by hand rather than with NextResponse.json: a 204 carries no body, so the JSON helper
  // throws constructing one and the route answers 500. Every test of this file passed with that
  // bug in it — they called the parser, and the parser was fine. It took a curl at a running
  // server to see it, which is the same lesson /api/health taught.
  const accepted = () => new NextResponse(null, { status: 204 });

  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("csp-report") && !type.includes("reports+json")) return accepted();

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBodyBytes) return accepted();

  try {
    const body = await request.text();
    if (body.length > maxBodyBytes) return accepted();
    const parsed: unknown = JSON.parse(body);

    if (Array.isArray(parsed)) {
      for (const entry of parsed as ModernReport[]) {
        if (entry?.type === "csp-violation" && entry.body) record(entry.body);
      }
      return accepted();
    }

    const legacy = (parsed as LegacyReport)?.["csp-report"];
    if (legacy) record(legacy);
  } catch {
    // A body that is not JSON is not worth a log line of its own; it is noise, by definition from
    // something that is not a browser reporting a violation.
  }

  return accepted();
}
