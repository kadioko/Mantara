# Mantara OS — project status audit

**Audited: 7 August 2026**
**Database state: migrations `0001`–`0017` applied to Supabase; `0018_ore_handling.sql` and `0019_sites_and_organization_settings.sql` ready to deploy**

## Executive status

**Current deployment update (7 August 2026):** migrations `0016_summary_respects_module_permissions.sql` and `0017_my_permissions.sql` are applied to Supabase. Summary figures now respect each module's own read permission, and the application resolves a member's permissions in one safe request instead of issuing many concurrent checks.

**Latest deployment update (7 August 2026):** migrations `0014_members_and_notifications.sql` and `0015_operational_summary.sql` are now applied to Supabase. `0015` provides a permission-checked summary RPC for future dashboards and reports. `supabase/seed-demo-operational.sql` has also been applied to the developer demo company, adding labelled showcase records for every operational module.

Mantara has a multi-tenant foundation with tenant isolation enforced in the database, and working
operational workflows for Workforce, Equipment, Production, Fuel, Maintenance, Inventory, Expenses,
Compliance, and Safety, plus a platform administration console.

Organizations can now administer themselves: invite people by email, change roles, and suspend access,
with the database refusing any change that would leave an organization without an owner. The insight
layer is in place — dashboard figures, reports with CSV export, notifications, and an audit log.

Migrations `0001`–`0015` are applied to Supabase and the production build passes. **Migration `0016`
is not deployed yet**: it closes a permission gap in `site_operational_summary()`, which returned
production and fuel figures to anyone holding `site.read`, regardless of whether they could read those
modules. A labelled demo workspace exists in Supabase.

Stage 8 is under way. The workers register, equipment register, and audit log page and search; workers
and equipment can be edited and removed; and an organization can now manage its own mine sites and
company details, which it previously could not do at all after onboarding. What remains before a
pilot: the same paging and editing treatment for the other lists and catalogues, document storage,
and the remaining Kiswahili coverage.

## Delivered

| Area | State |
| --- | --- |
| Foundation | Next.js 16, strict TypeScript, Tailwind v4, Supabase SSR clients, environment validation, Vercel deployment. |
| Authentication | Register, login, logout, callback, protected requests, onboarding redirect. Supabase owns password storage. |
| Tenancy | Organizations, memberships, mine sites with add/edit/retire, organization settings, active organization/site cookies, constraints and RLS. |
| Authorization | Organization roles, stable permission codes, defaults in `role_permission_defaults`, and platform administration as a separate axis that grants no tenant access. |
| Workspace UI | Responsive shell, permission-driven navigation, brand mark, language switcher, error/loading/not-found boundaries. |
| Design system | One set of primitives in `components/ui/` and one token palette. No screen hardcodes a colour outside the brand sidebar, and no module redefines its own panel or form control. |
| Localization | English and Kiswahili for navigation, authentication, onboarding, dashboard, and every module landing screen. |
| Workforce | Worker register and profile, assignments, training, PPE issues, daily attendance roster. |
| Equipment | Register and detail, meter readings that cannot move backwards, status history, operator assignments. |
| Production | Shifts, PPM grade capture, database-enforced approval lifecycle, downtime, bagged ore lots, and protected processing-plant dispatches. |
| Fuel | Stores with transactional balances, deliveries, issues, adjustments; balances cannot go negative. |
| Maintenance | Requests, work orders with an enforced lifecycle, parts, costs, service schedules that roll forward. |
| Inventory | Catalogue, stores, suppliers, stock ledger with non-negative balances and deadlock-safe transfers. |
| Expenses | Categories, approval lifecycle, budgets whose consumption counts approved and paid spend only. |
| Compliance | Licences with expiry tracking, organization-authored requirements, recurring tasks. |
| Safety | Incidents, inspections, corrective actions; personal and medical detail behind a granular permission and logged on every access. |
| Insight | Dashboard with permission-gated operational figures, organization audit log, reports with CSV export, and notifications. |
| User administration | Invitations by email, role changes, and suspension, with the database refusing to leave an organization without an owner. |
| Platform administration | `/admin` with organization metadata, suspension, administrator management, and an append-only platform audit log. |
| Quality | `npm run typecheck`, `npm run lint`, `npm run build`, and 362 tests pass. |

## Test coverage

Unit tests cover schema and form validation. Integration tests in `tests/integration/` apply the real
migration files to PostgreSQL compiled to WebAssembly and assert what the database itself enforces:

- Meter monotonicity, and that a rejected reading leaves the meter untouched.
- Fuel and stock balance floors, capacity limits, and that a rejected movement writes no row.
- A failed stock transfer leaving both stores unchanged.
- Production and expense approval lifecycles, including frozen figures after approval.
- Work-order completion rolling service schedules forward.
- Cross-tenant reads and writes blocked by RLS, even with a known row id.
- Platform administrators reading no rows from any operational table.
- Sensitive safety details being unreadable without the granular permission, and every access audited.

**Not covered:** Supabase Auth, Storage, and PostgREST behaviour, since the harness stubs them; and
real concurrency, which needs a multi-connection server. Those remain in the manual QA checklist.

## Remaining work

### Insight layer

- Dashboard trends over time, rather than the current point-in-time figures.
- Notifications currently cover submitted production and expenses only. Expiring licences and overdue
  corrective actions need a scheduled job, which has no home yet.

### Administration

- Role editing applies to the whole organization. Per-site restrictions are still not possible: a
  member holding a permission holds it at every site.
- Site-level access restrictions: a member with a permission holds it at every site in the organization.
- Invitations are claimed on sign-in; no email is actually sent, so the invitee has to be told
  out of band that they have been invited.

### Documents — built, switched off

The bucket, its policies, signed upload and download, and the document panel are all in place, but
`DOCUMENTS_ENABLED` defaults to off and the surface stays hidden. Storage cannot be exercised by the
migration harness or the test suite, so none of the upload path has been run against a real bucket.
Apply `0020_document_storage.sql`, set `DOCUMENTS_ENABLED=true`, and confirm an upload and a download
end to end before relying on it.

### Localization

`t()` falls back to English for any key a locale has not translated, so a screen can ship the day
its English copy is written rather than waiting on a translator, and a missing key renders readable
text instead of a blank. `npm run i18n:report` reports both kinds of gap.

- The catalogue itself is complete: 216 keys, 100% Swahili.
- The real gap is elsewhere. 595 phrases are written directly into components and so cannot be
  translated at all. The catalogue editors added 24 more. The report ranks them by file; the module form files are the worst by far
  (`production-forms.tsx`, `inventory-forms.tsx`, `safety-forms.tsx`). Lifting them into the
  catalogue is mechanical; writing the Swahili for mining terminology needs a speaker, not a
  machine translation, and is not something to fake.
- Shared primitives are translated, so pagination, search, and the offline banner are bilingual on
  every screen at once.

### Release readiness

- Pagination is on the workers and equipment registers, the audit log, production, expenses, safety
  incidents, maintenance work orders, and inventory stock. Search is on workers, equipment, and
  inventory stock.
- **Inventory stock is no longer assembled in the application.** It previously read every balance in
  the organization and narrowed it to the site in JavaScript, which meant that past PostgREST's
  1000-row response cap the screen quietly showed a subset of the stock as though it were all of it.
  Wrong figures that look right are worse than a slow page. `0023_stock_overview.sql` adds a
  `security_invoker` view so the join, filter, ordering and paging all happen in the database.
  `security_invoker` is the whole safety story there: without it the view would run as its owner and
  read straight past every RLS policy underneath. Removing that one clause makes five tests fail.
- **Every create-only catalogue can now be corrected.** Inventory items, categories, stores,
  suppliers, fuel tanks, and expense categories all have editing and retire/restore. The database
  already permitted these updates; only the actions and screens were missing.
- `0024_catalogue_integrity.sql` refuses to retire a store or item that still holds stock, or a fuel
  tank with litres in it, and names the quantity in the way. Retiring removes something from every
  movement form, so anything left in it becomes invisible and unmovable — the figures an operator
  reads stop matching what is on the ground, with no screen that would show why. Corrections and
  restorations are deliberately unaffected; the guard is about retirement only.
- Compliance requirements are still create-only.
- **Rate limiting** is in place (`0022_rate_limiting.sql`, `lib/auth/rate-limit.ts`) on invitations,
  role changes, sensitive safety reads, and report exports. The subject is always `auth.uid()` and
  never an argument, so a caller cannot exhaust someone else's allowance and lock them out. It fails
  open if the limiter itself errors: RLS and the permission checks remain the real protection, and an
  unreachable limiter must not stop an operator recording production. Sign-in and registration are
  excluded deliberately — they happen before there is a session to key on, and Supabase Auth applies
  its own limits there.
- **Accessibility.** `npm run a11y` and `npm run contrast` both pass. The sweep found and fixed five
  labelling and heading defects and four contrast failures, including a `--destructive` button that
  sat at 3.19:1 in dark theme. `--input` was raised to clear 3:1 against both card and background,
  because a text field's border is the only thing showing where the control ends. `--border` is
  recorded as decorative and exempt, with the reasoning kept in the script rather than dropped.
  These are mechanical checks only — no assistive-technology pass has been done, and a screen-reader
  run remains outstanding.
- **Monitoring.** `/api/health` proves database reachability, not just that Next.js is running, and
  returns `503` with no detail to an anonymous prober. `lib/observability/log.ts` writes one JSON
  line per event to stdout, which every hosting platform collects, and redacts personal and
  operational fields by name so an aggregator readable by a wide group never receives a worker's
  name or a tonnage figure.
- **Offline** is partly addressed and honestly so. `ConnectionStatus` warns an operator the moment
  the connection drops, which prevents the failure that actually costs an afternoon at a site with
  patchy signal: filling in a long form and losing it to a browser error page. Full offline capture —
  a service worker and a sync queue — is not built. Queuing writes against rules that can reject them
  on arrival is a design problem in its own right; a shift entry accepted on a phone and refused an
  hour later is worse than one that never appeared to save.
- Performance testing, backup and recovery, and pilot manual-QA signoff are still outstanding.

## Recommended next task

Deploy migrations `0019`–`0022`, then run the manual QA checklist against the live site. Everything
below that line is verified only as far as PGlite and a static analyser can reach: Storage, real
concurrency, Supabase Auth, and PostgREST behaviour are not covered by any test here.

After that, the largest remaining pieces of product work are lifting the uncatalogued UI phrases
into `lib/i18n/messages.ts` (with a Kiswahili speaker for the mining vocabulary), and giving
compliance requirements the same editing every other catalogue now has.
