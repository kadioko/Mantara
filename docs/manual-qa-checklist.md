# Manual QA checklist — Foundation

Before beginning this checklist, apply the foundation migration to the linked Supabase project. Track wider project progress in the [roadmap](roadmap.md).

- [ ] A new user can register, confirm email, sign in, and sign out.
- [ ] An authenticated user without a membership is sent to onboarding.
- [ ] Onboarding creates one organization, an active owner membership, default roles, and the first mine site.
- [ ] A member can only see its own organization and sites.
- [ ] User can change active organization and active mine-site context; each selection persists after a refresh.
- [ ] Direct URL requests without a session redirect to login.
- [ ] Attempted cross-tenant reads and writes are denied by RLS.
- [ ] Publishable key only is present in the browser; no service-role key is exposed.

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
- [ ] Two meter readings submitted at the same moment cannot both lower the meter (row lock holds under concurrency).
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
- [ ] Two simultaneous approvals of the same entry cannot both succeed (the row lock holds).
- [ ] Downtime rejects zero, negative, or fractional minutes.

## Fuel control

Apply `supabase/migrations/0005_fuel.sql` before running these checks.

- [ ] A fuel store can be created; a duplicate name at the same site is rejected.
- [ ] Recording a delivery increases the store balance by exactly the litres entered.
- [ ] Issuing fuel decreases the balance, and the issue appears against the chosen equipment or worker.
- [ ] **An issue larger than the balance is rejected**, and the message states the litres remaining.
- [ ] **Two concurrent issues cannot together overdraw a store** (the row lock serializes them).
- [ ] A delivery that would exceed a store's stated capacity is rejected.
- [ ] A negative adjustment reduces the balance; one larger than the balance is rejected.
- [ ] A zero-litre adjustment is rejected.
- [ ] Receipts, issues, and adjustments **cannot be inserted directly** by a client; only the recording functions write them.
- [ ] `apply_fuel_movement` is not executable by an ordinary authenticated user.
- [ ] Permissions separate correctly: `fuel.issue` alone allows issuing but not deliveries or adjustments.
- [ ] Balances and movements from another organization are never visible.

## Role permission defaults

- [ ] A newly created organization's mine manager, site supervisor, storekeeper, and maintenance officer receive the
      permissions listed in `role_permission_defaults` — verify at least one role per module.
- [ ] An organization created **before** these migrations has the same permissions after the backfill ran.
- [ ] A company owner holds every permission, including ones added by later migrations.
