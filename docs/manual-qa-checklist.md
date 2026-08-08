# Manual QA checklist

Apply every migration `0001`–`0027` to the linked Supabase project before working through this. Track wider
progress in the [roadmap](roadmap.md) and the [project status](project-status.md).

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

## Mine sites and organization

Apply `supabase/migrations/0019_sites_and_organization_settings.sql` before running these checks.

- [ ] A user with `site.create` can add a second mine site, and it appears in the site switcher immediately.
- [ ] A duplicate site name in the same organization is rejected; the same name in another organization is fine.
- [ ] Entering only a latitude or only a longitude is rejected.
- [ ] A site can be taken out of service while another remains active, and brought back later.
- [ ] **The last active site cannot be retired or deleted**, and the message says why.
- [ ] Editing the last active site's other details still works.
- [ ] A user with `site.read` but not `site.create` sees the list without the add button.
- [ ] The organization name can be changed by someone with `organization.update`, and the new name shows across the workspace.
- [ ] A user without `organization.update` sees the details read-only.

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

## Roles

Apply `supabase/migrations/0021_role_permissions_management.sql` before running these checks.

- [ ] `/settings/roles` lists every role with its permissions and member count.
- [ ] Saving a role replaces its grant with exactly the boxes ticked; unticking removes a permission.
- [ ] A member holding that role gains or loses access on their **next request**, without signing in again.
- [ ] **The owner role cannot be narrowed**, and the screen explains why rather than offering the control.
- [ ] A user with `role.read` but not `role.manage` sees the roles without an edit control.
- [ ] Every change appears in the audit log as `role.permissions_changed`.

## Documents (switched off)

- [ ] With `DOCUMENTS_ENABLED` unset, no document panel or upload control appears anywhere.
- [ ] After applying `0020_document_storage.sql` and setting `DOCUMENTS_ENABLED=true`: an upload succeeds and the file is listed.
- [ ] A download link works and expires shortly afterwards.
- [ ] **A signed URL cannot be obtained for a path in another organization.**
- [ ] A user without the module's update permission cannot upload; without its read permission cannot download.

## Role permission defaults

- [ ] A newly created organization's mine manager, site supervisor, storekeeper, and maintenance officer receive the
      permissions listed in `role_permission_defaults` — verify at least one role per module, including maintenance
      and inventory.
- [ ] An organization created **before** these migrations has the same permissions after the backfill ran.
- [ ] A company owner holds every permission, including ones added by later migrations.

## Catalogue editing and retirement

Apply `0023`–`0026` before running these checks.

- [ ] Every catalogue can be corrected after creation: inventory items, categories, stores, suppliers, fuel tanks,
      expense categories, mineral licences, and compliance requirements. Correcting a name never requires the
      record to be empty.
- [ ] **A store still holding stock cannot be taken out of service**, and the error names the quantity in the way.
- [ ] The same for an inventory item with stock anywhere, by both the retire and the delete route.
- [ ] **A fuel tank with litres in it cannot be retired**, and the error names the litres.
- [ ] Emptying the store, then retiring it, succeeds.
- [ ] A retired store, item, supplier or category disappears from the movement and entry forms but is still listed
      in its catalogue with a "Retired" badge, and can be restored.
- [ ] **A retired compliance requirement stops recurring**: completing its open task schedules nothing. Tasks
      already open stay open.
- [ ] Reinstating the requirement makes completion schedule the next one again.
- [ ] A member with the module's read permission but not its manage permission sees no edit or retire control, and
      a hand-crafted request is refused.

## Figures that must match the whole site, not the page

Apply `0025` before running these checks. Each of these was previously computed from the page on screen.

- [ ] With more than one page of work orders, **"Open work orders" does not change when you turn the page**, and
      matches the count across every page.
- [ ] The same for open maintenance requests and overdue service schedules.
- [ ] Expenses: "Approved spend" is the site's total, not the visible page's, and "Awaiting approval" likewise.
- [ ] Production: "Approved quantity" covers every approved entry. With more than 1000 approved entries it is
      still correct — this is the case the old implementation got wrong silently.
- [ ] **Weighted grade is weighted by tonnage.** With one 100 t lot at 3 PPM and one 1 t lot at 30 PPM it reads
      about 3.27 PPM, not 16.5.
- [ ] Dispatched lots are excluded from "Ready / in transit".
- [ ] A maintenance officer opening the production screen is refused the production totals rather than shown zeros.
- [ ] If the database is unreachable, figures render as "—" rather than "0".

## Reports

- [ ] A report covering more than 1000 rows returns **all** of them, in the table and in the CSV.
- [ ] A report exceeding the row ceiling shows a warning on screen **and** carries a truncation line in the CSV.
- [ ] The stock report for a multi-site organization shows only the active site's issues, and shows all of them.
- [ ] A value beginning `=`, `+`, `-` or `@` opens in Excel as text, not as a formula.
- [ ] **Negative amounts still open as numbers** and a column of them sums correctly.
- [ ] A user without a module's read permission cannot run or download that report by URL.

## Rate limiting

Apply `0022` before running these checks.

- [ ] Ordinary use never trips a limit: inviting a crew, changing a few roles, running several reports.
- [ ] Repeated report exports beyond the allowance return a clear message and a `429`, not a crash.
- [ ] **Another member's allowance is unaffected** by one member exhausting theirs.
- [ ] `select public.prune_rate_limit_events();` removes old rows and leaves recent ones.

## Localization

- [ ] Switching to Kiswahili translates the **data-entry forms**, not only the page headings — production capture,
      fuel issue, stock movement, expense entry, incident report.
- [ ] The language choice survives a refresh and applies across every screen.
- [ ] Pagination, search, and the offline banner are translated everywhere they appear.
- [ ] No screen shows a blank where a label should be, and no screen shows raw `{braces}`.
- [ ] **A Kiswahili speaker reviews the mining vocabulary** — grade, assay, ore lot, waybill, reorder level. This
      is the item that cannot be signed off by anyone else.

## Accessibility

`npm run a11y` and `npm run contrast` cover the mechanical failures. These are the ones they cannot.

- [ ] **A shift entry can be completed with the keyboard alone**, without a mouse, in a sensible order.
- [ ] A screen reader announces each form control with a label that says what it is for, and announces the row a
      per-row control belongs to rather than repeating "Edit" down the page.
- [ ] Errors are announced when they appear, not only shown.
- [ ] The workspace is usable at 200% browser zoom and on a 360px-wide phone.
- [ ] Nothing important is conveyed by colour alone.

## Health and logging

- [ ] `/api/health` returns `200` with a `databaseMs` figure while the database is reachable.
- [ ] With the database unreachable it returns `503` and reveals nothing else.
- [ ] It is reachable without a session, and discloses no schema, version, or tenant information.
- [ ] Application logs are one JSON line per event on stdout, and a log drain collects them.
- [ ] **No worker name, phone number, email, or tonnage appears in any log line.**
- [ ] Setting `LOG_LEVEL=warn` suppresses info lines without a redeploy.

## Offline

- [ ] Disconnecting the network shows the offline banner within a moment, in the active language.
- [ ] Reconnecting removes it without a reload.
- [ ] The banner is announced to a screen reader politely, not as an interruption.

## Scheduled alerts

Apply `0027` before running these checks. Run the job by hand with `select public.generate_alerts();`
rather than waiting for the schedule.

- [ ] `select jobname, schedule, active from cron.job where jobname = 'mantara-daily-alerts';` returns
      an active row. If `pg_cron` is unavailable on the project, confirm the migration said so and
      schedule the function by other means.
- [ ] A licence expiring in under 60 days produces a notification naming the licence and its date.
- [ ] **Running the job a second time produces nothing.** This is the property the whole design rests
      on; a job that re-sends the same alert daily teaches people to ignore notifications.
- [ ] Moving that licence closer, past the next threshold, produces exactly one further alert.
- [ ] A licence already expired produces nothing new.
- [ ] An overdue compliance task alerts people holding `compliance.read`.
- [ ] An overdue corrective action alerts people holding `safety.read` and **not** the compliance-only
      reader, and vice versa.
- [ ] Notifications link to the right screen: compliance alerts to `/compliance`, safety to `/safety`.
- [ ] **No alert about one organization reaches a member of another.**
- [ ] A suspended organization generates no alerts.
- [ ] `select has_function_privilege('authenticated', 'public.generate_alerts()', 'execute');` is
      false — no client may write notifications for other people.

## Per-site access restriction

Apply `0028` before running these checks. They need an organization with at least two mine sites.

- [ ] **Before restricting anyone, nothing changes.** Every existing member still sees every site's
      records and every site in the workspace switcher. This is the check that matters most on
      first deployment.
- [ ] Restricting a member to one site hides the other site's workers, equipment, production, fuel,
      maintenance, inventory, expenses and safety records from them.
- [ ] The other site disappears from their workspace switcher.
- [ ] **A crafted request naming a record at the other site is refused**, not merely hidden.
- [ ] They can still read and edit records at their own site as before.
- [ ] Restricting one person does not restrict anyone else.
- [ ] Organization-wide records — a licence or budget with no site — remain visible to them.
- [ ] **A company owner is never restricted**, even if their own row is set. Confirm by setting an
      owner to one site and checking they still reach the other.
- [ ] Saving with nothing ticked returns the member to every site, and the wording on the form says
      so before it is saved.
- [ ] A member without `member.update_role` sees the current access but no control to change it.
- [ ] Every change appears in the audit log as `member.sites_changed`.
- [ ] A restricted administrator cannot grant access to a site they cannot themselves see.
- [ ] **(concurrency)** Restricting a member while they have the app open takes effect on their next
      request, without them signing in again.
