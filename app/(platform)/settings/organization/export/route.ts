import { NextResponse } from "next/server";
import { runOrganizationExport, exportFileName } from "@/features/exports/run";
import { rateLimitMessage, withinRateLimit } from "@/lib/auth/rate-limit";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { logError, logInfo } from "@/lib/observability/log";

/**
 * Hands an organization a copy of its own records.
 *
 * Authenticated by the proxy like every other page — deliberately not listed in `publicPaths`, and
 * `tests/unit/security-headers.test.ts` would fail if it ever were. Permission and tenant scope are
 * decided inside `runOrganizationExport` and, underneath that, by the row-level security policies
 * acting on this caller's own session, so a hand-crafted URL cannot reach another company's data
 * and a site-restricted member receives only their sites.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const workspace = await getActiveWorkspace();
  const organization = workspace.activeOrganization;
  if (!organization) {
    return NextResponse.json({ error: "Select an active organization first." }, { status: 400 });
  }

  if (!await withinRateLimit("organization.export")) {
    return NextResponse.json({ error: await rateLimitMessage("organization.export") }, { status: 429 });
  }

  const result = await runOrganizationExport();
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 403 });

  const rowCount = Object.values(result.data).reduce((total, rows) => total + rows.length, 0);

  // Recorded before the file is sent. An export that failed on the way out has still been read out
  // of the database, and the owner asking "did anyone take a copy" wants that answer either way.
  const { error } = await workspace.supabase.rpc("record_organization_export", {
    requested_organization_id: organization.id,
    table_count: Object.keys(result.data).length,
    row_count: rowCount,
    was_complete: result.manifest.complete,
  });
  if (error) {
    // Refused rather than sent. This action is audited on purpose, and an unaudited copy of an
    // entire organization is precisely the thing the audit entry exists to prevent going unnoticed.
    logError({ event: "export.audit_failed", organizationId: organization.id, message: error.message });
    return NextResponse.json(
      { error: "This export could not be recorded in the audit log, so it was not produced. Please try again." },
      { status: 503 },
    );
  }

  logInfo({
    event: "export.produced",
    organizationId: organization.id,
    userId: workspace.user.id,
    tableCount: Object.keys(result.data).length,
    rowCount,
    complete: result.manifest.complete,
  });

  return new NextResponse(JSON.stringify(result, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(organization.name)}"`,
      "Cache-Control": "no-store",
      // Set again here rather than relying on the proxy. This body is every record the organization
      // holds, served from our own origin; a browser that decided it looked like HTML would run it
      // with the session attached. /api/health shipped broken because every test exercised the
      // handler and none exercised the layer in front of it.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
