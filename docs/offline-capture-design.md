# Offline capture design

## Problem and boundary

Mines may lose connectivity during a shift. Mantara currently warns users when they are offline; it does **not** claim a save succeeded until Supabase accepts it. The next phase should add queued capture for low-conflict records before attempting inventory, fuel, approvals, or dispatches.

## Phase A: safe offline drafts

- Store encrypted-at-rest, device-local drafts for shift, attendance, safety-observation and maintenance-request forms.
- Give every queued action a client-generated UUID, site/organization ID, actor ID, form version, creation time and idempotency key.
- Display `Draft`, `Queued`, `Syncing`, `Accepted`, `Needs review`, or `Rejected`; never display `Saved` before the server response.
- Sync in original order per record when connectivity returns, with exponential retry and a manual `Sync now` control.
- Expire local drafts after an agreed period and offer export/delete on sign-out or device handover.

## Phase B: conflict-aware workflows

For editable records, send an expected version/updated timestamp. If it changed on the server, preserve both versions and require a human to choose; do not silently overwrite.

Do **not** queue these initially: fuel issues/adjustments, inventory movements/count application, meter readings, production or expense approvals, and ore dispatches. They have server-enforced balance, ordering, or lifecycle rules. An offline request for one must remain a visible draft until an online server transaction accepts it.

## Acceptance criteria

1. A queued action survives a browser restart without exposing the organization to another device user.
2. Replaying the same queued action twice creates at most one server record.
3. Tenant/site switching cannot submit a draft into a different workspace.
4. A rejected sync explains the next safe action and preserves the user's original input for review.
5. Offline and reconnect flows pass keyboard and screen-reader review on Android and desktop browsers.
