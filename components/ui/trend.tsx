import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

export type Comparison = {
  measure: string;
  unit: string;
  current_value: string | number;
  previous_value: string | number;
  higher_is_better: boolean | null;
};

/**
 * One measure, this period against the one before it.
 *
 * The direction of the arrow is arithmetic; the colour is judgement, and the judgement comes from
 * the database with the measure rather than from a list of rules kept here. Fuel issued rising is
 * not bad news on its own — it is what a busy month looks like — so measures that carry no verdict
 * are shown plainly. Colouring those would teach people to ignore the colour on the ones that mean
 * something.
 */
export function TrendCard({ comparison, periodLabel }: { comparison: Comparison; periodLabel: string }) {
  const current = Number(comparison.current_value);
  const previous = Number(comparison.previous_value);
  const change = current - previous;

  // A percentage against zero is either infinity or nonsense, so a period that starts from nothing
  // gets described rather than divided.
  const percent = previous === 0 ? null : Math.round((change / Math.abs(previous)) * 100);

  const verdict =
    comparison.higher_is_better === null || change === 0
      ? "neutral"
      : (change > 0) === comparison.higher_is_better
        ? "better"
        : "worse";

  const tone =
    verdict === "better" ? "text-success" : verdict === "worse" ? "text-destructive" : "text-muted-foreground";
  const Arrow = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;

  const format = (value: number) =>
    value.toLocaleString(undefined, { maximumFractionDigits: Math.abs(value) < 10 ? 1 : 0 });

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{comparison.measure}</p>
      <p className="mt-1 text-2xl font-bold">
        {format(current)}
        <span className="ml-1.5 text-sm font-normal text-muted-foreground">{comparison.unit}</span>
      </p>
      <p className={`mt-1.5 flex items-center gap-1 text-sm font-medium ${tone}`}>
        <Arrow className="size-4 shrink-0" aria-hidden />
        {change === 0
          ? "No change"
          : `${change > 0 ? "+" : ""}${format(change)}${percent === null ? "" : ` (${percent > 0 ? "+" : ""}${percent}%)`}`}
        <span className="font-normal text-muted-foreground">on {periodLabel}</span>
      </p>
      {/* The comparison figure itself, because a percentage without its base is half a fact. */}
      <p className="mt-0.5 text-xs text-muted-foreground">
        {periodLabel}: {format(previous)} {comparison.unit}
      </p>
    </div>
  );
}
