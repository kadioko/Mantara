/**
 * Reports which migrations are applied to the linked Supabase project.
 *
 * Asks PostgREST whether each table and function exists. A table that exists answers 200 with an
 * empty array — empty because row-level security gives an anonymous caller nothing, which is the
 * point: this reads no tenant data at all, only whether the schema object is there. A table that
 * does not exist answers 404 with PGRST205.
 *
 * Needs only the publishable key from .env.local, the same one every browser receives.
 *
 * What it cannot see: policies, triggers, constraints, indexes and storage objects, none of which
 * PostgREST describes. Several migrations create only those, and are reported as unknown rather than
 * guessed at. For them, run supabase/verify-deployment.sql in the SQL editor.
 *
 *   node scripts/check-deployment.mjs
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error("No Supabase URL or publishable key in .env.local");
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };

/** True if the table is present, false if PostgREST does not know it. */
async function tableExists(name) {
  const response = await fetch(`${url}/rest/v1/${name}?select=*&limit=0`, { headers });
  if (response.status === 404) return false;
  if (response.ok) return true;
  const body = await response.text();
  // A permission error still proves the table is there; only PGRST205 means it is not.
  return !body.includes("PGRST205");
}

/**
 * True if the function is present.
 *
 * The arguments have to match a real signature. PostgREST answers PGRST202 both when a function does
 * not exist *and* when it exists but no overload takes the arguments given, so calling with an empty
 * body reports every function as missing — which is exactly the false negative this check made on
 * its first outing, and it nearly had me report the live site as completely broken.
 *
 * With the right arguments, `42501 permission denied` is the expected answer and is proof the
 * function is there: these are all revoked from anon on purpose.
 */
async function functionExists(name, args) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (response.ok) return true;
  const body = await response.text();
  if (body.includes("PGRST202")) return false;
  // Anything else — a permission error, an auth error, a raised exception — required the function
  // to exist in order to be produced.
  return true;
}

const NO_SUCH_ID = "00000000-0000-0000-0000-000000000000";

const table = (name) => () => tableExists(name);
const rpc = (name, args) => () => functionExists(name, args);

const markers = [
  ["0001", "foundation", table("organizations")],
  ["0002", "workers", table("workers")],
  ["0004", "equipment", table("equipment")],
  ["0005", "production", table("production_entries")],
  ["0006", "fuel", table("fuel_storage_locations")],
  ["0007", "maintenance", table("maintenance_work_orders")],
  ["0008", "inventory", table("inventory_items")],
  ["0009", "expenses", table("expenses")],
  ["0010", "platform admin", table("platform_audit_logs")],
  ["0011", "compliance", table("mineral_licences")],
  ["0012", "safety", table("safety_incidents")],
  ["0014", "members and notifications", table("organization_invitations")],
  ["0015", "operational summary", rpc("site_operational_summary", { requested_site_id: NO_SUCH_ID })],
  ["0017", "my permissions", rpc("my_permissions", { requested_organization_id: NO_SUCH_ID })],
  ["0018", "ore handling", table("ore_lots")],
  ["0019", "sites and organization settings", null],
  ["0020", "document storage", null],
  ["0021", "role permissions management", rpc("set_role_permissions", { requested_organization_id: NO_SUCH_ID, role_code: "x", permission_codes: [] })],
  ["0022", "rate limiting", rpc("consume_rate_limit", { requested_bucket: "probe", max_events: 1, window_seconds: 60 })],
  ["0023", "stock overview", table("inventory_stock_overview")],
  ["0024", "catalogue integrity", null],
  ["0025", "module totals", rpc("production_totals", { requested_site_id: NO_SUCH_ID })],
  ["0026", "compliance recurrence", null],
  ["0027", "scheduled alerts", rpc("generate_alerts", {})],
  ["0028", "site restriction", table("membership_sites")],
  ["0029", "stock overview ordering", null],
  ["0030", "fuel reconciliation", table("fuel_stock_takes")],
  ["0031", "inventory stock counts", table("inventory_stock_counts")],
  ["0032", "period comparison", rpc("site_period_comparison", { requested_site_id: NO_SUCH_ID })],
];

console.log(`Project: ${new URL(url).host}\n`);

const unknown = [];
let applied = 0;
let missing = 0;

for (const [number, name, check] of markers) {
  if (check === null) {
    unknown.push([number, name]);
    continue;
  }
  const present = await check();
  if (present) applied += 1;
  else missing += 1;
  console.log(`  ${present ? "applied" : "MISSING"}  ${number}  ${name}`);
}

console.log(`\n${applied} applied, ${missing} missing.`);

if (unknown.length) {
  console.log("\nNot visible through the API — these create only triggers, indexes, policies,");
  console.log("storage objects, or replace an existing function. Check these with");
  console.log("supabase/verify-deployment.sql in the SQL editor:");
  for (const [number, name] of unknown) console.log(`  ?        ${number}  ${name}`);
}
