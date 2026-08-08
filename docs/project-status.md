# Mantara OS — project status

**Audited: 8 August 2026**
**Database: migrations `0001`–`0018` applied to Supabase. `0019`–`0029` written, tested, and not deployed.**

This is a statement of where the product actually is, not a changelog. Where something is unverified,
it says so.

## Executive summary

Every planned module is built. Mantara has a multi-tenant foundation with isolation enforced in the
database, working operational capture for Workforce, Equipment, Production and ore handling, Fuel,
Maintenance, Inventory, Expenses, Compliance and Safety, an insight layer of dashboard figures,
reports, notifications and an audit log, and self-administration for organizations and for the
platform team.

The gap between "built" and "in use" is deployment. **Eleven migrations are undeployed**, and until they
are applied the following are not live: mine-site management, organization settings, custom roles,
rate limiting, the stock overview, the catalogue retirement guards, the module totals, the compliance
recurrence fix, the scheduled alerts, and per-site access restriction.

Nothing in the running deployment is broken by their absence — but two things are worth being blunt
about. Several headline figures on the live site are still computed the old, incorrect way. And
nobody is being told when a licence is about to expire.

## Delivered

| Area | State |
| --- | --- |
| Foundation | Next.js 16, strict TypeScript, Tailwind v4, Supabase SSR clients, environment validation, Vercel deployment. |
| Authentication | Register, login, logout, callback, protected requests, onboarding redirect. Supabase owns password storage. |
| Tenancy | Organizations, memberships, mine sites with add/edit/retire, organization settings, active organization/site cookies, constraints and RLS. |
| Authorization | Organization roles, stable permission codes, defaults in `role_permission_defaults`, a role-editing screen, optional per-member mine-site restriction, and platform administration as a separate axis granting no tenant access. |
| Workspace UI | Responsive shell, permission-driven navigation, brand mark, language switcher, offline banner, error/loading/not-found boundaries. |
| Design system | One set of primitives in `components/ui/` and one token palette, verified against WCAG AA in both themes by `npm run contrast`. |
| Localization | Bilingual navigation, authentication, onboarding, dashboard, every module landing screen, the shared list primitives, and the module data-entry forms. |
| Workforce | Worker register and profile with editing and removal, assignments, training, PPE issues, daily attendance roster. |
| Equipment | Register and detail with editing and retirement, meter readings that cannot move backwards, status history, operator assignments. |
| Production | Shifts, PPM grade capture, database-enforced approval lifecycle, downtime, bagged ore lots, protected plant dispatches. |
| Fuel | Tanks with transactional balances, deliveries, issues, adjustments, catalogue editing; balances cannot go negative and a tank holding fuel cannot be retired. |
| Maintenance | Requests, work orders with an enforced lifecycle, parts, costs, service schedules that roll forward. |
| Inventory | Catalogue with full editing, stores, suppliers, a stock ledger with non-negative balances and deadlock-safe transfers, and a paged site-scoped stock overview. |
| Expenses | Categories with editing, approval lifecycle, budgets whose consumption counts approved and paid spend only. |
| Compliance | Licences with expiry tracking and editing, organization-authored requirements with editing and retirement, recurring tasks that stop when a requirement is retired. |
| Safety | Incidents, inspections, corrective actions; personal and medical detail behind a granular permission, rate limited, and logged on every access. |
| Insight | Dashboard with permission-gated figures, organization audit log, reports with CSV export that cannot silently truncate, and notifications including scheduled alerts for licence expiry and overdue work. |
| User administration | Invitations by email, role changes and suspension, with the database refusing to leave an organization without an owner. Rate limited. |
| Platform administration | `/admin` with organization metadata, suspension, administrator management, and an append-only platform audit log. |
| Operations | `/api/health` proving database reachability, structured JSON logging with field redaction, a Postgres-backed rate limiter. |
| Quality | `npm run typecheck`, `npm run lint`, `npm run build`, `npm run a11y`, `npm run contrast` and 529 tests pass. |

## What the tests actually prove

Unit tests cover schemas, validation, paging, report paging, CSV generation, structured logging, and
the message catalogue. Integration tests apply the **real migration files** to PostgreSQL compiled to
WebAssembly and assert what the database itself enforces:

- Meter monotonicity, and that a rejected reading leaves the meter untouched.
- Fuel and stock balance floors, capacity limits, and that a rejected movement writes no row.
- A failed stock transfer leaving both stores unchanged.
- Production and expense approval lifecycles, including frozen figures after approval.
- Work-order completion rolling service schedules forward, and a retired requirement stopping.
- Cross-tenant reads and writes blocked by RLS, even with a known row id.
- The stock overview enforcing RLS through the view, and its `security_invoker` declaration itself.
- Module totals gated on each module's own read permission, not merely on membership.
- Retirement guards refusing to strand stock, and permitting ordinary corrections.
- Platform administrators reading no rows from any operational table.
- Sensitive safety details unreadable without the granular permission, and every access audited.
- Rate limiting keyed on the caller, with no way to spend someone else's allowance.
- Every pending migration surviving being applied twice, since a half-finished apply through the SQL
  editor is not wrapped in a transaction and the natural next move is to run it again.
- Site restriction hiding another site's records and refusing writes to them, staying inert for
  members who have none, never applying to organization-wide records or to a company owner, and
  covering every table that carries a mine_site_id.
- Alert generation being idempotent across repeated runs, escalating through expiry thresholds
  without repeating one, routing compliance and safety work to different readers, and generating
  nothing for a suspended organization or across a tenant boundary.

**Not covered:** Supabase Auth, Storage and PostgREST behaviour, since the harness stubs them; and
real concurrency, which needs a multi-connection server. Both remain in the manual QA checklist.

## Corrections made to figures that were wrong

Worth recording, because each was invisible rather than broken:

- **Inventory stock** read every balance in the organization and narrowed it to the site in
  JavaScript. Past PostgREST's 1000-row cap the screen showed a subset as though it were the whole.
  `0023` moves the join, filter, ordering and paging into a `security_invoker` view.
- **Every stat card** on production, maintenance, expenses and fuel was computed from whatever rows
  the page held — a page of 25 work orders, the last 50 ore lots. Each was a site-wide claim made
  from a page-sized sample. `0025` computes them in the database.
- **Weighted ore grade** averaged the lots instead of weighting by tonnage. 100 t at 3 PPM with 1 t
  at 30 PPM read as 16.5 PPM rather than 3.27 — five times the truth.
- **Report exports** stopped at 1000 rows silently. A year of production for a royalty return would
  have come back short and looked complete. Reports now page to a ceiling and say when they hit it,
  in the CSV file as well as on screen.
- **The stock report** was short twice over for a multi-site company: capped organization-wide, then
  filtered to the site in JavaScript.
- **Retiring a compliance requirement** did not stop it recurring, because the recurrence was read
  without checking `is_active`. The obligation would reappear every month indefinitely.

A failed totals lookup now renders a dash rather than a zero. Zero is a claim, and it is the wrong
claim when the truth is that we could not find out.

## Remaining work

### Insight

- Dashboard trends over time, rather than point-in-time figures.

### Administration

- Invitations are claimed on sign-in and no email is sent, so an invitee has to be told out of band.
- A table added to the schema after `0028` needs its own site-restriction policy. The migration
  generates them from the catalogue, so it cannot miss a table that existed when it ran, but it
  cannot reach forward either. This is recorded in the architecture blueprint.

### Documents — built, switched off

The bucket, its policies, signed upload and download, and the document panel are all in place, but
`DOCUMENTS_ENABLED` defaults to off and the surface stays hidden. Storage cannot be exercised by the
migration harness or the test suite, so **none of the upload path has been run against a real
bucket**. Apply `0020`, set `DOCUMENTS_ENABLED=true`, and confirm an upload and a download end to end
before relying on it.

### Localization

`useT()` in `lib/i18n/client.tsx` gives client components the locale. Until it existed, every
data-entry form in the product was stuck in English while the pages around them were bilingual —
backwards for a product whose forms are filled in by supervisors at a mine site and whose landing
pages are read by head office.

- The catalogue is complete: 326 keys, 100% Kiswahili.
- 422 phrases are still written directly into components and cannot be translated at all, down from
  595. `npm run i18n:report` ranks them by file. Most of what remains is placeholder example text
  ("CAT 320 excavator", "WAYBILL-001") and one-off headings rather than field labels.
- The mechanical part is lifting them into the catalogue. **The part that needs a person is the
  Kiswahili for mining vocabulary** — grade, assay, headgear, stope, waybill. Machine-translating
  those would produce something a Tanzanian operator would not trust, which is worse than English.

### Accessibility

`npm run a11y` and `npm run contrast` both pass. They catch mechanical failures only. **No
assistive-technology pass has been done** — whether a label is meaningful, whether the focus order
makes sense, and whether a screen reader can complete a shift entry are all still unverified.

### Offline

`ConnectionStatus` warns the moment the connection drops, which prevents the failure that costs an
afternoon at a site with patchy signal: filling in a long form and losing it to a browser error page.

Full offline capture is not built and is not a small addition. Queuing writes against database rules
that can reject them on arrival is a design problem in its own right — a shift entry accepted on a
phone and refused an hour later is worse for an operator than one that never appeared to save.

### Performance

`tests/integration/query-plans.test.ts` seeds a year of production and a full stock matrix, then
asserts on the **plans** the screens' own queries produce. Timings in WebAssembly are noise; plans
are not. It covers list paging, the headline totals, and the cost of the site restriction.

One real limit was found and is documented rather than papered over. The stock overview reads every
balance in the organization and sorts it to return twenty-five, because the screen orders by item
name — a column on the joined item — so there is nothing ordered on the balance table for the
planner to walk:

| balances | plan | time (WASM) |
| --- | --- | --- |
| 3,200 | Seq Scan + top-N heapsort | 14 ms |
| 20,000 | Seq Scan + top-N heapsort | 47 ms |
| 100,000 | Seq Scan + top-N heapsort | 232 ms |

Indexing the balances does not help, and neither does putting the mine site on the balance row — in
the ordinary case one site holds all of an organization's stock, so the site filter removes nothing.
Both were tried and measured. The fix that would work is denormalising the item name onto the
balance, and that is deliberately not done: it costs a trigger, makes renaming an item rewrite its
balance rows, and creates a second place for the name to be wrong. 100,000 balances means roughly
10,000 catalogue items across 10 stores, far beyond the operations this is built for, and these are
WASM figures — real PostgreSQL is an order of magnitude quicker.

**Revisit when** a pilot's stock overview passes about 100,000 balances. `npm run plan:probe`
reproduces the measurement and the test holds the current shape so it cannot drift quietly.

### Still outstanding

Load testing against a real server with concurrent users, backup and recovery procedure, and pilot
manual-QA signoff.

## Recommended next task

Deploy `0019`–`0029` following [the runbook](deployment.md), then work the manual QA checklist
against the live site. Everything below that
line is verified only as far as PGlite and a static analyser reach: Storage, real concurrency,
Supabase Auth and PostgREST behaviour are covered by no test here.
