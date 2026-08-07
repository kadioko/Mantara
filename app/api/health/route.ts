import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/observability/log";

/**
 * A liveness and readiness probe for whatever is watching the deployment.
 *
 * It answers one question honestly: can this instance reach the database it needs to serve a
 * request? A check that only proves Next.js is running would go green during exactly the outage
 * worth paging someone about.
 *
 * It is deliberately anonymous and deliberately thin on detail. Anyone can call it, so it must not
 * become a way to learn the schema, the version, or which tenants exist — the response says up or
 * down and how long the database took, and nothing else.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    const supabase = await createClient();
    // A permission-free read: this proves connectivity and that RLS is loaded, without touching
    // tenant data. An anonymous caller sees zero rows, which is the correct answer and still a
    // successful round trip.
    const { error } = await supabase.from("permissions").select("code", { count: "exact", head: true });
    if (error) throw new Error(error.message);

    return NextResponse.json(
      { status: "ok", databaseMs: Date.now() - started },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // Logged in full so the cause is recoverable; returned vaguely so a prober learns nothing.
    logError({ event: "health.check.failed", message: error instanceof Error ? error.message : String(error), durationMs: Date.now() - started });
    return NextResponse.json(
      { status: "degraded" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
