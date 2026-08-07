# Mantara OS — project status audit

**Audited: 7 August 2026**
**Database state: migrations `0001`–`0013` applied to Supabase; `0014` awaiting deployment**

## Executive status

Mantara has a multi-tenant foundation with tenant isolation enforced in the database, and working
operational workflows for Workforce, Equipment, Production, Fuel, Maintenance, Inventory, Expenses,
Compliance, and Safety, plus a platform administration console.

Organizations can now administer themselves: invite people by email, change roles, and suspend access,
with the database refusing any change that would leave an organization without an owner. The insight
layer is in place — dashboard figures, reports with CSV export, notifications, and an audit log.

Migrations `0001`–`0013` are applied to Supabase and the production build passes. **Migration `0014`
adds invitations and notifications and is not deployed yet**, so user administration and notifications
will not work against the live project until it is applied. A labelled demo workspace exists in Supabase.

Stage 8 has started: the workers register, equipment register, and audit log now page and search, and
workers and equipment can be edited and removed. What remains before a pilot: the same treatment for
the other lists and catalogues, document storage, organization settings, and the remaining Kiswahili
coverage.

## Delivered

| Area | State |
| --- | --- |
| Foundation | Next.js 16, strict TypeScript, Tailwind v4, Supabase SSR clients, environment validation, Vercel deployment. |
| Authentication | Register, login, logout, callback, protected requests, onboarding redirect. Supabase owns password storage. |
| Tenancy | Organizations, memberships, mine sites, active organization/site cookies, constraints and RLS. |
| Authorization | Organization roles, stable permission codes, defaults in `role_permission_defaults`, and platform administration as a separate axis that grants no tenant access. |
| Workspace UI | Responsive shell, permission-driven navigation, brand mark, language switcher, error/loading/not-found boundaries. |
| Design system | One set of primitives in `components/ui/` and one token palette. No screen hardcodes a colour outside the brand sidebar, and no module redefines its own panel or form control. |
| Localization | English and Kiswahili for navigation, authentication, onboarding, dashboard, and every module landing screen. |
| Workforce | Worker register and profile, assignments, training, PPE issues, daily attendance roster. |
| Equipment | Register and detail, meter readings that cannot move backwards, status history, operator assignments. |
| Production | Shifts, production capture, database-enforced approval lifecycle, downtime. |
| Fuel | Stores with transactional balances, deliveries, issues, adjustments; balances cannot go negative. |
| Maintenance | Requests, work orders with an enforced lifecycle, parts, costs, service schedules that roll forward. |
| Inventory | Catalogue, stores, suppliers, stock ledger with non-negative balances and deadlock-safe transfers. |
| Expenses | Categories, approval lifecycle, budgets whose consumption counts approved and paid spend only. |
| Compliance | Licences with expiry tracking, organization-authored requirements, recurring tasks. |
| Safety | Incidents, inspections, corrective actions; personal and medical detail behind a granular permission and logged on every access. |
| Insight | Dashboard with permission-gated operational figures, organization audit log, reports with CSV export, and notifications. |
| User administration | Invitations by email, role changes, and suspension, with the database refusing to leave an organization without an owner. |
| Platform administration | `/admin` with organization metadata, suspension, administrator management, and an append-only platform audit log. |
| Quality | `npm run typecheck`, `npm run lint`, `npm run build`, and 310 tests pass. |

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

- Organization settings and custom role management. `role.manage` still has no screen behind it.
- Mine-site management UI beyond onboarding, and site-level access restrictions.
- Invitations are claimed on sign-in; no email is actually sent, so the invitee has to be told
  out of band that they have been invited.

### Documents

- Private Supabase Storage buckets, upload UI, file validation, and signed-URL access.
  `equipment_documents`, `compliance_documents`, and training certificates all store a path today with
  no way to put a file at it.

### Localization

- Client-side forms and detail views are still English. Module landing screens are translated.

### Release readiness

- Pagination and search are on the workers register, equipment register, and audit log. Production,
  expenses, safety incidents, maintenance work orders, and the inventory balances still cap silently.
- Editing and removal exist for workers and equipment. Inventory items, suppliers, fuel stores,
  compliance requirements, and expense categories are still create-only.
- Rate limiting on sensitive actions, a full accessibility audit, and performance testing. Forms use
  enclosing labels and the primitives carry focus-visible rings, but no assistive-technology pass has
  been done.
- PWA/offline capture, monitoring, backup and recovery, pilot manual-QA signoff.

## Recommended next task

Continue stage 8. Extend the paging and editing patterns now established in `lib/paging.ts` and the
worker/equipment screens to the remaining lists and catalogues, then document storage, which several
tables already have columns for.
