# Manual QA checklist — Foundation

Before beginning this checklist, apply the foundation migration to the linked Supabase project. Track wider project progress in the [roadmap](roadmap.md).

> Many of the database rules below are now covered automatically by `tests/integration/`, which applies the real
> migrations to a real PostgreSQL and asserts them. Run `npm run test` first; treat the items here as confirmation
> against genuine Supabase, and give priority to the ones the integration tests **cannot** reach — anything marked
> **(concurrency)** or **(Supabase only)**.

- [ ] **(Supabase only)** A new user can register, confirm email, sign in, and sign out.
- [ ] An authenticated user without a membership is sent to onboarding.
- [ ] Onboarding creates one organization, an active owner membership, default roles, and the first mine site.
- [ ] A member can only see its own organization and sites.
- [ ] User can change active organization and active mine-site context; each selection persists after a refresh.
- [ ] **(Supabase only)** Direct URL requests without a session redirect to login.
- [ ] Attempted cross-tenant reads and writes are denied by RLS.
- [ ] **(Supabase only)** Publishable key only is present in the browser; no service-role key is exposed.

## Workspace shell

- [ ] The organization and mine-site labels and both "Switch" buttons are clearly readable against the dark sidebar.
- [ ] The same switcher is readable in the mobile menu, which uses the same dark panel.
- [ ] A long organization or site name is not cut off in the closed select; hovering shows the full name.
- [ ] Switching organization or site persists after a refresh.
- [ ] **Navigation shows the same modules on every load.** Reload the dashboard several times; items must not appear and disappear.

## Workforce — workers and attendance

Apply `supabase/migrations/0002_workers.sql` before running these checks.

- [ ] A user with `worker.create` can register a worker at the active mine site; the record appears in the register.
- [ ] Duplicate employee numbers within one organization are rejected with a clear message.
- [ ] The register and attendance roster only list workers from the active organization and mine site.
- [ ] On `/attendance`, changing the date and choosing "Load day" reloads the roster with that day's saved statuses.
- [ ] Saving attendance stores one record per worker for the chosen date; re-saving the same day updates rather than duplicates records.
- [ ] Workers left as "Not recorded" are not written for that date.
- [ ] A user with `worker.read` but not `worker.update` can view attendance but cannot record it.
- [ ] A user without `worker.read` is redirected away from `/workers` and `/attendance`.
- [ ] Opening a worker from the register shows profile, assignments, training, PPE, and recent attendance.
- [ ] Assignment and training forms reject an end/expiry date earlier than the start/completion date.
- [ ] PPE issue rejects a zero or negative quantity.
- [ ] A worker id from another mine site cannot be used to attach an assignment, training record, or PPE issue.

## Equipment

Apply `supabase/migrations/0003_equipment.sql` before running these checks.

- [ ] A user with `equipment.create` can add an asset; it appears in the register with its category and status.
- [ ] Duplicate asset codes within one organization are rejected with a clear message.
- [ ] Leaving the opening meter blank stores no meter reading rather than zero.
- [ ] Recording a meter reading updates the current meter and appears in the reading history.
- [ ] **A meter reading lower than the current meter is rejected** with the database's message.
- [ ] **(concurrency)** Two meter readings submitted at the same moment cannot both lower the meter.
- [ ] Changing status writes a status-history row automatically, including the reason entered on the form.
- [ ] A status change made directly against the table (not via the form) still produces a history row, with no reason.
- [ ] Meter readings and status history **cannot be inserted directly** by a client; only the database function and trigger write them.
- [ ] Assigning an operator only offers workers from the active mine site, and a worker from another site is rejected.
- [ ] A user with `equipment.read` but not `equipment.update` sees history but no meter, status, or assignment forms.
- [ ] A user without `equipment.read` is redirected away from `/equipment`.
- [ ] Equipment and its history from another organization are never visible.

## Production and approvals

Apply `supabase/migrations/0004_production.sql` before running these checks.

- [ ] A shift can be created; a duplicate name on the same date at the same site is rejected.
- [ ] A new production entry is created as a **draft**.
- [ ] Leaving grade blank stores no grade rather than zero.
- [ ] A draft can be submitted, and its `submitted_at` is stamped automatically.
- [ ] A user with `production.update` but not `production.approve` sees no review form on a submitted entry.
- [ ] Approving records a `production_approvals` row and moves the entry to approved.
- [ ] Rejecting moves the entry to rejected, and it can then be returned to draft and resubmitted.
- [ ] **An already-approved or draft entry cannot be reviewed** — only a submitted entry can.
- [ ] **An approved entry's quantity, material, grade, unit, or date cannot be edited** (the freeze trigger rejects it).
- [ ] An invalid transition (for example draft straight to approved) is rejected by the database.
- [ ] `production_approvals` cannot be inserted directly by a client; only `review_production_entry` writes them.
- [ ] **(concurrency)** Two simultaneous approvals of the same entry cannot both succeed.
- [ ] Downtime rejects zero, negative, or fractional minutes.

## Ore handling and processing-plant dispatch

Apply `supabase/migrations/0018_ore_handling.sql` after the production migration.

- [ ] A bagged ore lot records the source, tonnes, assay grade in PPM, bag count, and bag weight.
- [ ] Duplicate lot numbers inside one organization are rejected; the same number in another organization is allowed.
- [ ] A user without `production.create` cannot create an ore lot, and a user without `production.read` cannot see lots or dispatches.
- [ ] A dispatch links to a bagged lot and names the processing plant, tonnes, bags, and transport reference.
- [ ] A dispatch that would exceed either the ore lot's tonnes or bag count is rejected and writes no dispatch row.
- [ ] **(concurrency)** Two dispatches cannot together exceed a lot's tonnes or bags.
- [ ] A fully dispatched lot is marked dispatched; a partial dispatch is marked in transit.
- [ ] A dispatch is written to the organization audit log, while a user in another organization sees neither the lot nor the audit entry.

## Fuel control

Apply `supabase/migrations/0005_fuel.sql` before running these checks.

- [ ] A fuel store can be created; a duplicate name at the same site is rejected.
- [ ] Recording a delivery increases the store balance by exactly the litres entered.
- [ ] Issuing fuel decreases the balance, and the issue appears against the chosen equipment or worker.
- [ ] **An issue larger than the balance is rejected**, and the message states the litres remaining.
- [ ] **(concurrency)** Two concurrent issues cannot together overdraw a store.
- [ ] A delivery that would exceed a store's stated capacity is rejected.
- [ ] A negative adjustment reduces the balance; one larger than the balance is rejected.
- [ ] A zero-litre adjustment is rejected.
- [ ] Receipts, issues, and adjustments **cannot be inserted directly** by a client; only the recording functions write them.
- [ ] `apply_fuel_movement` is not executable by an ordinary authenticated user.
- [ ] Permissions separate correctly: `fuel.issue` alone allows issuing but not deliveries or adjustments.
- [ ] Balances and movements from another organization are never visible.

## Maintenance

Apply `supabase/migrations/0006_maintenance.sql` before running these checks.

- [ ] A request can be raised against equipment, and a work order can be created from an open request.
- [ ] A new work order starts as **planned**.
- [ ] Moving a work order to in progress stamps `started_at` automatically.
- [ ] **An invalid transition is rejected** — for example planned straight to completed, or reopening a completed order.
- [ ] The status dropdown never offers a move the database would reject, and never offers "completed" directly.
- [ ] Completing a work order stamps `completed_at` and records the service meter.
- [ ] **Completing a work order rolls its equipment's active service schedules forward** — `last_service_on`, and `next_due_on`/`next_due_meter` recalculated from the intervals.
- [ ] Completing a work order that is not in progress is rejected.
- [ ] A service schedule with neither a meter interval nor a day interval is rejected.
- [ ] Parts and costs can only be attached to a work order at the active mine site.
- [ ] A user with `maintenance.create` but not `maintenance.update` cannot complete a work order or add costs.

## Inventory

Apply `supabase/migrations/0007_inventory.sql` before running these checks.

- [ ] Items, categories, and suppliers are shared across the organization; stores belong to one mine site.
- [ ] Receiving stock creates the balance row on first movement and increases it thereafter.
- [ ] Issuing stock decreases the balance and can be linked to a work order, equipment, or worker.
- [ ] **An issue larger than the balance is rejected**, naming the quantity remaining.
- [ ] **(concurrency)** Two concurrent issues cannot together take a balance below zero.
- [ ] A transfer moves stock between two stores and is rejected when both are the same store.
- [ ] **(concurrency)** Two opposing transfers of the same item running at once do not deadlock.
- [ ] A transfer larger than the source balance is rejected and leaves **both** stores unchanged.
- [ ] A negative adjustment larger than the balance is rejected; a zero adjustment is rejected.
- [ ] Balances, receipts, issues, transfers, and adjustments **cannot be written directly** by a client.
- [ ] `apply_stock_movement` is not executable by an ordinary authenticated user.
- [ ] An item and a store from different organizations cannot be combined in one movement.
- [ ] Permissions separate correctly: `inventory.issue` alone allows issuing but not receiving, transferring, or adjusting.
- [ ] Items at or below their reorder level appear on the reorder watch.

## Expenses and budgets

Apply `supabase/migrations/0008_expenses.sql` before running these checks.

- [ ] A new expense is created as a **draft** and can be submitted for approval.
- [ ] A user with `expense.create` but not `expense.approve` sees no review form on a submitted expense.
- [ ] Approving records an `expense_approvals` row and moves the expense to approved.
- [ ] **An approved expense's amount, category, date, or currency cannot be edited.**
- [ ] An invalid transition is rejected — draft straight to approved, or paying an unapproved expense.
- [ ] An approved expense can be marked paid, and `paid_on` is stamped automatically.
- [ ] `expense_approvals` cannot be inserted directly by a client.
- [ ] **(concurrency)** Two simultaneous reviews of the same expense cannot both succeed.
- [ ] Budget progress counts approved and paid expenses only — a draft does not move the bar.
- [ ] A category-scoped budget ignores expenses in other categories; a site-scoped budget ignores other sites.
- [ ] A budget whose end date precedes its start date is rejected.
- [ ] An over-budget figure is shown clearly rather than being capped silently.

## Compliance

Apply `supabase/migrations/0010_compliance.sql` before running these checks.

- [ ] A licence can be recorded, and one expiring within 60 days is highlighted.
- [ ] A licence whose expiry precedes its issue date is rejected.
- [ ] Requirements are authored by the organization; nothing in the product asserts what the law requires.
- [ ] A task linked to a **recurring** requirement schedules the next one on completion, at the right interval.
- [ ] A one-off task, or one with no requirement, schedules nothing on completion.
- [ ] A task cannot be completed twice.
- [ ] A user with `compliance.read` only cannot complete a task.
- [ ] Overdue tasks are shown as overdue against today's date.
- [ ] A document must be attached to a licence or a task; neither is rejected.

## Safety

Apply `supabase/migrations/0011_safety.sql` before running these checks.

- [ ] An incident can be reported, and appears with its category and severity.
- [ ] A site supervisor (holding `safety.read` but not `safety.read_sensitive`) sees the incident but **cannot open sensitive details**.
- [ ] A safety officer can record and open sensitive details.
- [ ] **Opening sensitive details writes an `audit_logs` row naming the reader**, and a second view writes a second row.
- [ ] A denied attempt writes **no** audit row.
- [ ] Sensitive details cannot be read by querying `safety_incident_details` directly, even as a safety officer.
- [ ] Sensitive details cannot be inserted directly into that table.
- [ ] A user without `safety.read_sensitive` is told details exist without any of their content being shown.
- [ ] A corrective action must be attached to an incident or an inspection.
- [ ] Overdue corrective actions are shown as overdue.
- [ ] A user without `safety.read` is redirected away from `/safety`.

## User administration

Apply `supabase/migrations/0014_members_and_notifications.sql` before running these checks.

- [ ] A user with `member.invite` can invite an email address that has no account yet.
- [ ] Inviting the same address twice leaves one pending invitation, with the most recent role.
- [ ] Inviting someone who is already a member is rejected.
- [ ] **(Supabase only)** The invitee registers with that address, signs in, and lands in the inviting organization rather than onboarding.
- [ ] An invitee who signs in with a password (not the email link) is also admitted.
- [ ] A revoked or expired invitation admits nobody.
- [ ] Changing a member's role takes effect on their next request.
- [ ] **Nobody can change their own role or suspend their own access.**
- [ ] **The last active owner cannot be demoted or suspended**, even by someone holding `member.update_role`.
- [ ] A suspended member loses their permissions but keeps their records.
- [ ] Every invitation, role change, and suspension appears in `/settings/audit-logs`.

## Notifications and reports

- [ ] Submitting production notifies everyone holding `production.approve`, but not the submitter.
- [ ] Submitting an expense notifies everyone holding `expense.approve`.
- [ ] Someone without the approval permission receives nothing.
- [ ] A user sees only their own notifications, and "mark all read" clears only theirs.
- [ ] The unread count in the navigation matches the notifications page.
- [ ] Each report only appears for a user holding the matching read permission.
- [ ] The CSV download contains the same rows as the screen, including beyond the 200 shown.
- [ ] **A hand-edited `/reports/export` URL for another organization returns no data**, and an invalid date range is rejected.
- [ ] A value containing a comma or quote survives the CSV round trip intact.

## Platform administration

Apply `supabase/migrations/0009_platform_admin.sql`, then bootstrap the first administrator with the
`insert into public.platform_admins` statement documented at the end of that file.

- [ ] **(Supabase only)** The bootstrap insert makes exactly one administrator, and `/admin` opens for them.
- [ ] A user who is not a platform administrator is redirected away from `/admin` and every page beneath it.
- [ ] An organization owner is **not** a platform administrator by virtue of owning an organization.
- [ ] A platform administrator with no organization lands on `/admin` rather than onboarding.
- [ ] A platform administrator who is also a member of an organization sees a "Platform admin" link in the workspace.
- [ ] **The organizations list shows names, counts, and dates only — no worker, production, fuel, stock, or expense records are reachable anywhere under `/admin`.**
- [ ] Suspending an organization requires a reason and shows it in the list.
- [ ] A suspended organization's members can still read their records but cannot create or edit anything.
- [ ] Suspension affects only the chosen organization.
- [ ] Restoring an organization returns write access immediately.
- [ ] Granting platform access by email works, and an unknown email is rejected with a clear message.
- [ ] The last remaining administrator cannot be revoked.
- [ ] Every suspension, restoration, grant, and revocation appears in the audit log with the actor's name.
- [ ] A tenant user cannot read `platform_audit_logs` or `platform_admins`.
- [ ] Neither table can be written directly, even by a platform administrator.

## Operational summary

- [ ] `site_operational_summary()` refuses a site in another organization and an unknown site id.
- [ ] **A maintenance officer sees equipment figures but zero for production and fuel**, which they hold no read permission for. One `site.read` must not stand in for every module.
- [ ] An owner sees every figure populated.

## Role permission defaults

- [ ] A newly created organization's mine manager, site supervisor, storekeeper, and maintenance officer receive the
      permissions listed in `role_permission_defaults` — verify at least one role per module, including maintenance
      and inventory.
- [ ] An organization created **before** these migrations has the same permissions after the backfill ran.
- [ ] A company owner holds every permission, including ones added by later migrations.
