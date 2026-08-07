"use client";

import { useActionState, useState } from "react";
import { Pencil, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionFeedback } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";

type State = { error?: string; success?: string };
type Action = (state: State, formData: FormData) => Promise<State>;

/** useActionState needs an action even when the row has no retire control; this one is never wired. */
const noRetire: Action = async () => ({});

/**
 * One catalogue row: what it is, and the two things you can do to it.
 *
 * Fields are passed as children and use the enclosing-label primitives rather than `id`/`htmlFor`.
 * A catalogue renders one of these per row, so ids would repeat down the page and every label would
 * point at the first row's control — exactly the defect the accessibility sweep exists to prevent.
 */
export function CatalogueRow({
  id,
  name,
  detail,
  isActive,
  updateAction,
  statusAction,
  canManage,
  children,
  retireLabel = "Retire",
  restoreLabel = "Restore",
}: {
  id: string;
  name: string;
  detail?: React.ReactNode;
  isActive: boolean;
  updateAction: Action;
  /** Omitted for catalogues that cannot be retired, such as inventory categories. */
  statusAction?: Action;
  canManage: boolean;
  children: React.ReactNode;
  retireLabel?: string;
  restoreLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [updateState, submitUpdate, updatePending] = useActionState(updateAction, {} as State);
  const [statusState, submitStatus, statusPending] = useActionState(statusAction ?? noRetire, {} as State);

  return (
    <div className="border-b border-border px-5 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{name}</p>
          {detail && <p className="mt-0.5 truncate text-sm text-muted-foreground">{detail}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isActive && <Badge variant="secondary">Retired</Badge>}
          {canManage && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditing((wasEditing) => !wasEditing)}
                aria-expanded={editing}
                // Without the name, a screen reader hears "Edit" once per row and nothing else.
                aria-label={editing ? `Stop editing ${name}` : `Edit ${name}`}
              >
                {editing ? <X aria-hidden /> : <Pencil aria-hidden />}
                {editing ? "Cancel" : "Edit"}
              </Button>
              {statusAction && <form action={submitStatus}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="isActive" value={isActive ? "false" : "true"} />
                <Button
                  variant={isActive ? "ghost" : "outline"}
                  size="sm"
                  disabled={statusPending}
                  aria-label={`${isActive ? retireLabel : restoreLabel} ${name}`}
                >
                  {!isActive && <RotateCcw aria-hidden />}
                  {statusPending ? "Saving…" : isActive ? retireLabel : restoreLabel}
                </Button>
              </form>}
            </>
          )}
        </div>
      </div>

      {/* The database refuses to retire something that still holds stock and says how much. That
          message is the whole point of the guard, so it belongs against the row it concerns. */}
      {(statusState.error || statusState.success) && (
        <div className="mt-2"><ActionFeedback state={statusState} /></div>
      )}

      {editing && (
        <form action={submitUpdate} className="mt-4 grid gap-4 md:grid-cols-3">
          <input type="hidden" name="id" value={id} />
          {children}
          <div className="md:col-span-3"><ActionFeedback state={updateState} /></div>
          <div className="flex gap-2 md:col-span-3">
            <Button disabled={updatePending} size="sm">{updatePending ? "Saving…" : "Save changes"}</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** A catalogue panel: a heading, an optional create form, and the rows. */
export function CatalogueList({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
