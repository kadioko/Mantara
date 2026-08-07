import { cva, type VariantProps } from "class-variance-authority";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const alertVariants = cva("rounded-lg border px-4 py-3 text-sm", {
  variants: {
    variant: {
      default: "bg-card text-card-foreground",
      info: "border-transparent bg-secondary text-secondary-foreground",
      success: "border-transparent bg-success/12 text-success",
      warning: "border-transparent bg-warning/18 text-warning-foreground",
      destructive: "border-transparent bg-destructive/12 text-destructive",
    },
  },
  defaultVariants: { variant: "default" },
});

export type AlertProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>;

export function Alert({ className, variant, ...props }: AlertProps) {
  return <div className={cn(alertVariants({ variant }), className)} {...props} />;
}

/** Renders a server action's result, using the roles assistive technology expects for each outcome. */
export function ActionFeedback({ state }: { state: { error?: string; success?: string } }) {
  if (state.error) return <Alert role="alert" variant="destructive">{state.error}</Alert>;
  if (state.success) return <Alert role="status" variant="success">{state.success}</Alert>;
  return null;
}

export function EmptyState({ title, description, icon }: { title: string; description?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = "default" }: { label: string; value: React.ReactNode; hint?: string; tone?: "default" | "warning" | "destructive" }) {
  const toneClass = tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning-foreground" : "text-foreground";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/35 group-hover:shadow-lg">
      <div aria-hidden className="absolute -right-8 -top-8 size-20 rounded-full bg-primary/5 transition-transform duration-300 group-hover:scale-125" />
      <ArrowUpRight aria-hidden className="absolute right-4 top-4 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      <p className="relative text-sm text-muted-foreground">{label}</p>
      <p className={cn("relative mt-1 text-2xl font-bold tabular-nums", toneClass)}>{value}</p>
      {hint && <p className="relative mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-accent-foreground">{eyebrow}</p>}
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-2 text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
