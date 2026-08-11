# Mantara OS — project status

**Audited: 9 August 2026**
**Database: every migration through `0037` applied. `0034` adds operational intelligence, `0035` geology, `0036` forecasts/daily summaries, and `0037` aligns site restriction and geology audit coverage. `0038_export_audit.sql` is new and pending — until it is applied the data export refuses rather than producing an unaudited copy.**

This is a statement of where the product actually is, not a changelog. Where something is unverified,
it says so.

## Executive summary

Every planned module is built. Mantara has a multi-tenant foundation with isolation enforced in the
database, working operational capture for Workforce, Equipment, Production and ore handling, Fuel,
Maintenance, Inventory, Expenses, Compliance and Safety, an insight layer of dashboard figures,
reports, notifications and an audit log, and self-administration for organizations and for the
platform team.

The deployment gap that dominated this document has closed: everything through `0033` is applied, so
mine-site management, organization settings, custom roles, rate limiting, the stock overview, the
catalogue guards, the corrected module totals, the compliance recurrence fix, the scheduled alerts
and per-site restriction are all live. **`0033` also adds trigger-level audit coverage** for fuel and stock adjustments/takes, production and expense review, and operational retirements, so those actions now leave an audit entry even when they do not go through a particular server action.

*(Until 9 August this section still said twelve migrations were undeployed, which stopped being true
several commits earlier. The header at the top of this file was right and the summary was stale —
recorded here because a status document that contradicts itself is worse than one that is merely out
of date.)*

## Delivered

| Area | State |
| --- | --- |
| Foundation | Next.js 16, strict TypeScript, Tailwind v4, Supabase SSR clients, environment validation, Vercel deployment. |
| Authentication | Register, login, logout, callback, protected requests, onboarding redirect. Supabase owns password storage. |
| Tenancy | Organizations, memberships, mine sites with add/edit/retire, organization settings, active organization/site cookies, constraints and RLS. |
| Authorization | Organization roles, stable permission codes, defaults in `role_permission_defaults`, a role-editing screen, optional per-member mine-site restriction, and platform administration as a separate axis granting no tenant access. |
| Workspace UI | Responsive shell, permission-driven navigation, brand mark, language switcher, offline banner, error/loading/not-found boundaries. |
| Design system | One set of primitives in `components/ui/` and one token palette, verified against WCAG AA in both themes by `npm run contrast`. |
| Localization | 100% paired English/Kiswahili catalogue. Safety and production forms are fully lifted; the static report still identifies 268 older UI phrases in other screens. |
| Workforce | Worker register and profile with editing and removal, assignments, training, PPE issues, daily attendance roster. |
| Equipment | Register and detail with editing and retirement, meter readings that cannot move backwards, status history, operator assignments. |
| Production | Shifts, PPM grade capture, database-enforced approval lifecycle, downtime, bagged ore lots, protected plant dispatches. |
| Fuel | Tanks with transactional balances, deliveries, issues, adjustments, catalogue editing, reconciliation against a measured dip, and consumption per machine; balances cannot go negative and a tank holding fuel cannot be retired. |
| Maintenance | Requests, work orders with an enforced lifecycle, parts, costs, service schedules that roll forward. |
| Inventory | Catalogue with full editing, stores, suppliers, a stock ledger with non-negative balances and deadlock-safe transfers, a paged site-scoped stock overview, and stock counts that keep the shrinkage they find. |
| Expenses | Categories with editing, approval lifecycle, budgets whose consumption counts approved and paid spend only. |
| Compliance | Licences with expiry tracking and editing, organization-authored requirements with editing and retirement, recurring tasks that stop when a requirement is retired. |
| Safety | Incidents, inspections, corrective actions; personal and medical detail behind a granular permission, rate limited, and logged on every access. |
| Insight | Dashboard and `/intelligence` with cost/unit, budget, productivity, utilization, explicit recovery/price assumptions, revenue-backed cash-flow forecasts, daily source summaries and evidence-bounded Mantara Brain guidance. |
| Geology | Samples, assays, drill collars and intervals, licence-boundary GeoJSON, private files, a boundary/point map and evidence-bounded GeoAI observations. |
| User administration | Invitations by email, role changes and suspension, with the database refusing to leave an organization without an owner. Rate limited. |
| Platform administration | `/admin` with organization metadata, suspension, administrator management, and an append-only platform audit log. |
| Operations | `/api/health` proving database reachability, structured JSON logging with field redaction, a Postgres-backed rate limiter, and security headers on every response with a Content-Security-Policy reporting to `/api/csp-report`. |
| Quality | `npm run typecheck`, `npm run lint`, `npm run build`, `npm run a11y`, `npm run contrast` and 711 tests pass (1 skipped). |

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
- Every action that moves value or discharges an obligation writing an audit entry — fuel and stock
  adjustments, stock takes, production and expense approvals and rejections, and every retirement —
  recorded by trigger so no write path can miss one, and the log unwritable, uneditable and
  undeletable from any client.
- Rate limiting keyed on the caller, with no way to spend someone else's allowance.
- Every pending migration surviving being applied twice, since a half-finished apply through the SQL
  editor is not wrapped in a transaction and the natural next move is to run it again.
- Site restriction hiding another site's records and refusing writes to them, staying inert for
  members who have none, never applying to organization-wide records or to a company owner, and
  covering every table that carries a mine_site_id.
- Alert generation being idempotent across repeated runs, escalating through expiry thresholds
  without repeating one, routing compliance and safety work to different readers, and generating
  nothing for a suspended organization or across a tenant boundary.

Two static checks close a gap the type system cannot reach. The Supabase client is untyped, so 55
table names, 41 function names, and every column and RPC argument in the application are unverified
until runtime. `tests/unit/schema-contract.test.ts` reads the real schema out of the migrations and
asserts every query matches it — the same shape as the permission-code check that caught
`expense.manage`.

The repository harness still stubs Auth/Storage/PostgREST, but the live QA harness covers them separately. On 9 August 2026 it passed authenticated owner access, bidirectional cross-tenant RLS, a rejected foreign-tenant write, real concurrent serialized meter writes, grounded forecast/daily-summary RPCs and an HTTP 200 signed private download outside the automated browser.

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

### Accountability — applied, needs live confirmation

The audit log previously recorded member changes, role changes, ore dispatches and every read of a
worker's medical detail. It recorded none of the actions that move value: a fuel adjustment taking
4,000 litres out of a tank, a stock adjustment, a production approval that a royalty return is built
from, an expense approval, or any retirement. Those are exactly what an owner or an inspector asks
about afterwards, and there was no answer on any screen.

`0033` records them by **trigger rather than at the call site**. A trail that depends on each function
remembering to write one has holes wherever somebody forgot, and the holes are invisible — the log
looks fine, it is simply missing the row.

### Insight

**The dashboard now compares.** A bare figure is not information: 1,240 tonnes means nothing until
you know last month was 1,350. `site_period_comparison()` returns the last 30 days against the 30
before, per measure, gated on the same read permission as the records behind it — a trend line
discloses as much as a figure, which is the leak `0016` fixed in `operational_summary`.

Each measure carries **whether up is good**, so the screen colours a change without a second list of
rules drifting away from this one. Production rising is good; downtime and incidents rising are not;
fuel issued and spend rising are neither on their own — burning more fuel while producing more ore is
what a busy month looks like, and calling that bad would teach people to ignore the colour.

Both variances surface here, which is the point of putting them on the dashboard: a storekeeper sees
shrinkage on the inventory screen and a fuel officer sees it on the fuel screen, but the person who
cares most about both opens the dashboard and nothing else.

- Still point-in-time rather than a series: this compares two periods, it does not draw a line over
  twelve. A chart is the obvious next step and needs no new data.

**Fuel variance is measured**, which one of the pilot success criteria asks for and nothing
addressed. A stock take records the measured level against the book level, keeps the difference as a
number, and corrects the balance through the ordinary adjustment path. Previously that discrepancy
was entered as an adjustment with a free-text reason: the balance was fixed and the finding was
destroyed, because "400" and "shortfall after dip" read the same to a database.

Consumption per machine comes from the meter reading already captured on every fuel issue, so it
asks nobody to record anything new. Litres are divided by meter distance across consecutive issues,
weighted by distance rather than averaging per-fill rates — a small top-up over a short run must not
count as much as a full tank over a long shift.

**Inventory variance is now measured too.** A stock count is a store walked shelf by shelf: many
lines, entered over an afternoon, applied once. The book quantity is captured **when the count is
applied, not when a line is entered** — stock keeps moving while somebody counts, and reading the
book figure at entry time would silently reverse a legitimate issue made an hour later and report it
as a shortfall that never happened.

`inventory_shrinkage()` totals what the counts found per item. One negative variance is a miscount as
often as a loss; the same item short in three counts running is the thing worth acting on, and that
is only visible once the findings are kept as numbers.


### Administration

- **Invitations are now emailed**, behind a switch. Off unless the provider credentials and the site
  URL are all configured, and with it off the screen says plainly to tell the person directly. The
  invitation is the record and the email is a courtesy: a provider outage reports "could not be
  sent" rather than losing the invitation. **The sending itself has never been exercised against a
  real provider** — the message text, the switch, and every failure path are tested; delivery is not.
- A table added to the schema after `0028` needs its own site-restriction policy. The migration
  generates them from the catalogue, so it cannot miss a table that existed when it ran, but it
  cannot reach forward either. This is recorded in the architecture blueprint.

### Documents — live upload and signed download verified

The private bucket and its policies are applied. A geology document was uploaded through the deployed UI and its signed URL was fetched outside the automated browser (HTTP 200, non-empty body). `DOCUMENTS_ENABLED` remains a deployment switch; expiry and denial for every role still belong in pilot signoff.

### Localization

`useT()` in `lib/i18n/client.tsx` gives client components the locale. Until it existed, every
data-entry form in the product was stuck in English while the pages around them were bilingual —
backwards for a product whose forms are filled in by supervisors at a mine site and whose landing
pages are read by head office.

- The catalogue is fully paired: every English key has Kiswahili.
- **The rate-limit refusal now speaks Kiswahili.** It was hard-coded English behind a bilingual
  product, on one of the few screens where the reader is already being told no. It reads the locale
  itself rather than taking one, so no call site can forget to pass it.
- **The panel titles and descriptions on every module page are translated.** Those are the sentences
  somebody reads to work out what a screen is for, and they matter more to a supervisor navigating
  the product than any single field label does.
- 268 older phrases remain after lifting 125 of the reported 393, including all phrases in the safety and production forms. `npm run i18n:report` ranks the remaining work by file.
- **The report itself was understating the gap.** It never counted `description`, `hint` or
  `eyebrow`, which are exactly the explanatory sentences under a heading — the text a reader who is
  lost most needs. Fixed, so today's number is honest and slightly higher than a naive comparison
  with earlier figures would suggest.
- Example placeholders are deliberately left in English: "CAT 320 excavator", "EXC-001", "3600".
  They are format hints, and a product code rendered in Kiswahili would be less useful than the
  original, not more.
- The mechanical part is lifting them into the catalogue. **The part that needs a person is the
  Kiswahili for mining vocabulary** — grade, assay, headgear, stope, waybill. Machine-translating
  those would produce something a Tanzanian operator would not trust, which is worse than English.

### The browser

Until 9 August the product sent **no security headers at all**. Every response — pages, the CSV
export, the redirect a signed-out visitor lands on — carried nothing. RLS decides who may read a
record and does that well, but it runs in the database and has no view of what happens inside a
browser that is already holding a valid session, and nothing was covering that.

Now in place, enforcing, on every response including the redirects:

| Header | Why this value |
| --- | --- |
| `X-Content-Type-Options: nosniff` | The CSV export is `text/csv` full of text an operator typed. A browser that sniffed it as HTML would run it on our origin. |
| `X-Frame-Options: DENY` | A hostile page overlaying ours collects clicks that approve production or change a role. |
| `Referrer-Policy: same-origin` | Not the usual `strict-origin-when-cross-origin`: URLs here name records, and that a particular record was open is not something an external site should learn. |
| `Cross-Origin-Opener-Policy: same-origin` | No page we open keeps a handle on us. |
| `Permissions-Policy` | Camera, microphone, geolocation, payment and the sensors, all denied. Nothing asks for them; a dependency that starts asking is refused by policy rather than by a prompt somebody clicks through. |
| `Strict-Transport-Security` | Two years, subdomains included, **without `preload`** — preloading is a one-way door granted by browser vendors and applies to subdomains this project does not control. |

**The Content-Security-Policy is real, strict, and deliberately not enforcing.** It is sent as
`Content-Security-Policy-Report-Only`, so today it blocks nothing and reports everything to
`/api/csp-report`, which writes `csp.violation` into the ordinary log stream. A strict policy added
to an application that never had one will find something, and an enforcing policy that finds
something is a blank screen with the explanation in a console nobody at a mine site is reading.

The nonce works — this was checked against a production build, not assumed: all twelve script tags
Next.js renders on the login screen carry it and every one matches the header. That mattered more
than it sounds. Without it every hydration script would report a violation, the genuine findings
would drown, and the policy would never be promoted out of report-only.

Promoting it is one line: the header name in `securityHeaders`. **Not before a week of real use has
produced no report you cannot explain.**

Two smaller things found in the same area:

- **`document.upload` had an allowance in the rate-limit table and nothing consuming it.** Every
  rate-limit test passed, because they exercise the database function, which was being asked
  nothing. The one call in the product that creates a storage object per request was unlimited.
  `tests/unit/security-headers.test.ts` now fails if any declared bucket has no call site.
- **`/manifest.webmanifest` was answering a 307 to the login page.** It is linked from the head of
  every page including `/login`, and browsers fetch it without credentials, so installing the app
  was broken on the only screen a signed-out visitor sees. Same shape as the `/api/health` bug: a
  path that must answer anonymously, not named as one.

And one caught only by running the thing: the report collector answered **500 to every report**,
because `NextResponse.json` cannot build a 204. Its unit tests passed — they called the parser, and
the parser was correct. A `curl` at a running server found it in one request. A report channel that
silently 500s is worse than none, because the quiet reads as a clean policy.

### Data portability — the commercial question

A mining company asks one thing before it puts a year of production into a product it has never
used: **can we get it back out?** Until 11 August the honest answer was no. The four reports are
date-ranged and scoped to a single mine site, so a company with two pits could not assemble its own
records even by hand, and there was nothing that returned the other sixty tables at all.

`/settings/organization/export` now returns everything the organization holds as one JSON file, with
a manifest. Four decisions worth knowing:

- **The table list is written out, not discovered.** Reading `information_schema` at runtime would be
  shorter and would quietly ship whatever happened to be there, including operational telemetry.
  Naming all 64 is a set of reviewable decisions, and `tests/unit/export-catalogue.test.ts` fails
  when a table carrying `organization_id` is neither exported nor excluded — so the promise cannot
  fall behind the schema in silence.
- **The manifest states what is missing** — per table: rows, ceiling reached, withheld for want of
  permission, or failed outright. A client handed 90% of their records with no indication is worse
  off than one handed 90% and the list of the other 10%, because the first believes it is everything.
  A complete-looking file run by a site-restricted member is the specific trap, so the manifest names
  the sites it covered and says an owner would receive more.
- **Site restriction is inherited, not reimplemented.** `0028`'s restrictive policies act on the
  caller's own session. There is deliberately no site logic in the export to drift from the original.
- **`safety_incident_details` is excluded, with the reason in the file.** Every read of it is audited
  one record at a time; a bulk file would turn that into an unaudited copy of everything.

The export is audited through `record_organization_export()` and rate limited to 3 an hour — the
tightest allowance in the product, because one request returns sixty tables where every other read
returns twenty-five rows. **If the audit entry cannot be written, the file is not produced.**

Two real defects were found by writing the tests rather than by reading the code: three tables were
catalogued with an `orderBy` column that does not exist on them (`equipment_status_history` uses
`changed_at`, the two approval tables use `decided_at`), which would have failed those tables at
runtime and reported them in the manifest as faults with no clue why.

**Not yet verified:** the authenticated download itself. The route is proven to require a session,
the manifest and catalogue are unit-tested, and the audit function and tenant boundary are tested
against real policies — but nobody has yet signed in, clicked the button, and opened the file. It is
on the QA checklist.

### Accessibility

`npm run a11y` and `npm run contrast` both pass. They catch mechanical failures only. **No
assistive-technology pass has been done** — whether a label is meaningful, whether the focus order
makes sense, and whether a screen reader can complete a shift entry are all still unverified.

### Offline

`ConnectionStatus` warns the moment the connection drops, which prevents the failure that costs an
afternoon at a site with patchy signal: filling in a long form and losing it to a browser error page.

Phase A offline capture now covers shift plans, maintenance requests, attendance rosters and ordinary safety inspections with AES-GCM encrypted,
user/organization/site-bound drafts in IndexedDB and clear them only after a successful server save.
Balance-sensitive, medical-detail and approval workflows intentionally stay online-only until their conflict and device-risk behavior is designed and tested.

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

Wider live load testing, a backup-and-recovery drill, screen-reader testing and pilot signoff remain. A two-tenant live RLS test and a same-record concurrent-write test now pass; these are security/concurrency proofs, not a capacity test.

The Content-Security-Policy is outstanding in a specific sense: it is written, served and reporting,
but it has never blocked anything and cannot be called proven until a week of real traffic has been
read. Nobody should describe this product as having a CSP until that has happened.

## Recommended next task

Finish the 268 remaining localization findings, then run the screen-reader, recovery and multi-user load sessions required for pilot signoff.
