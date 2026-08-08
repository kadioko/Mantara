"use client";

import { useActionState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ActionFeedback } from "@/components/ui/feedback";
import { Field, fieldClass, selectClass } from "@/components/ui/form";
import { useT } from "@/lib/i18n/client";
import { addStockCountLine, applyStockCount, createStockCount, type InventoryState } from "./actions";
import type { Option } from "./inventory-forms";

export type CountLine = {
  id: string;
  counted_quantity: string;
  book_quantity: string | null;
  variance_quantity: string | null;
  item: { name: string; unit: string } | { name: string; unit: string }[] | null;
};

export type StockCount = {
  id: string;
  reference: string | null;
  status: string;
  counted_on: string;
  location: { name: string } | { name: string }[] | null;
  lines: CountLine[];
};

const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);

export function StartStockCountForm({ stores, today }: { stores: Option[]; today: string }) {
  const tr = useT();
  const [state, action, pending] = useActionState(createStockCount, {} as InventoryState);
  return (
    <form action={action} className="grid gap-4 md:grid-cols-4">
      <Field label={tr("fStore")} required>
        <select required name="locationId" defaultValue={stores[0]?.id ?? ""} className={selectClass}>
          {stores.map((store) => <option key={store.id} value={store.id}>{store.label}</option>)}
        </select>
      </Field>
      <Field label={tr("fReference")} hint="Optional — a sheet number, or who counted.">
        <input name="reference" maxLength={120} className={fieldClass} />
      </Field>
      <Field label={tr("fDate")} required>
        <input required name="countedOn" type="date" defaultValue={today} className={fieldClass} />
      </Field>
      <div className="flex items-end">
        <Button disabled={pending}><ClipboardCheck aria-hidden />{pending ? "Starting…" : "Start count"}</Button>
      </div>
      <div className="md:col-span-4"><ActionFeedback state={state} /></div>
    </form>
  );
}

/**
 * An open count: what has been entered so far, and the control that applies it.
 *
 * Nothing here shows a variance, because none exists yet. The book quantity is read when the count
 * is applied, not when a line is entered — stock keeps moving while somebody walks the shelves, and
 * showing a difference against a figure that is already stale would invite people to "correct" it.
 */
export function OpenStockCount({ count, items }: { count: StockCount; items: Option[] }) {
  const tr = useT();
  const [lineState, addLine, addingLine] = useActionState(addStockCountLine, {} as InventoryState);
  const [applyState, apply, applying] = useActionState(applyStockCount, {} as InventoryState);
  const location = one(count.location);

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h3 className="font-semibold">
            {location?.name ?? "Store"}
            {count.reference && <span className="ml-2 text-sm font-normal text-muted-foreground">{count.reference}</span>}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">Counted {count.counted_on} · {count.lines.length} item{count.lines.length === 1 ? "" : "s"} entered</p>
        </div>
        <form action={apply}>
          <input type="hidden" name="stockCountId" value={count.id} />
          <Button disabled={applying || count.lines.length === 0} variant="default">
            {applying ? "Applying…" : "Apply count"}
          </Button>
        </form>
      </div>

      <form action={addLine} className="grid gap-4 border-b border-border px-5 py-4 md:grid-cols-4">
        <input type="hidden" name="stockCountId" value={count.id} />
        <Field label={tr("fItem")} required className="md:col-span-2">
          <select required name="itemId" defaultValue="" className={selectClass}>
            <option value="" disabled>Choose an item</option>
            {items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </Field>
        <Field label="Counted quantity" required>
          <input required name="countedQuantity" type="number" min="0" step="0.001" className={fieldClass} />
        </Field>
        <div className="flex items-end">
          <Button disabled={addingLine} variant="outline">{addingLine ? "Saving…" : "Add"}</Button>
        </div>
        <div className="md:col-span-4"><ActionFeedback state={lineState} /></div>
      </form>

      {count.lines.length > 0 && (
        <ul className="divide-y divide-border px-5">
          {count.lines.map((line) => {
            const item = one(line.item);
            return (
              <li key={line.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="font-medium">{item?.name ?? "Unknown item"}</span>
                <span className="text-muted-foreground">{Number(line.counted_quantity).toLocaleString()} {item?.unit}</span>
              </li>
            );
          })}
        </ul>
      )}

      {(applyState.error || applyState.success) && (
        <div className="px-5 pb-4"><ActionFeedback state={applyState} /></div>
      )}
    </section>
  );
}

/** A count that has been applied: what it found, which is the part worth keeping on screen. */
export function AppliedStockCount({ count }: { count: StockCount }) {
  const location = one(count.location);
  const findings = count.lines.filter((line) => Number(line.variance_quantity ?? 0) !== 0);

  return (
    <div className="border-b border-border px-5 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">
          <span className="font-medium">{location?.name ?? "Store"}</span>
          <span className="ml-2 text-muted-foreground">
            {count.counted_on}{count.reference ? ` · ${count.reference}` : ""} · {count.lines.length} counted
          </span>
        </span>
        {findings.length === 0
          ? <Badge variant="success">All matched</Badge>
          : <Badge variant="destructive">{findings.length} discrepanc{findings.length === 1 ? "y" : "ies"}</Badge>}
      </div>

      {findings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {findings.map((line) => {
            const item = one(line.item);
            const variance = Number(line.variance_quantity);
            return (
              <li key={line.id} className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="text-muted-foreground">{item?.name ?? "Unknown item"}</span>
                <span className={variance < 0 ? "font-semibold text-destructive" : "font-semibold text-warning-foreground"}>
                  {variance > 0 ? "+" : ""}{variance.toLocaleString()} {item?.unit}
                  <span className="ml-2 font-normal text-muted-foreground">
                    counted {Number(line.counted_quantity).toLocaleString()} against {Number(line.book_quantity).toLocaleString()}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
