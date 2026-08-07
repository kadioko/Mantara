import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * One definition of what a form control looks like. Every module form previously declared its own
 * copy of these strings, which is how the same input ended up with three different border radii.
 */
export const controlClass =
  "flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

export const fieldClass = cn("mt-1", controlClass);
export const selectClass = cn(fieldClass, "appearance-none bg-card pr-8");
export const textareaClass = cn("mt-1", controlClass, "h-auto min-h-20");

/**
 * Wraps a control in its label. The label element encloses the control, so the association holds
 * without needing a unique id on every field across a dozen forms.
 */
export function Field({
  label,
  required,
  hint,
  className,
  children,
}: {
  label: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="text-sm font-medium leading-none">
        {label}
        {required && <span aria-hidden> *</span>}
        {required && <span className="sr-only"> (required)</span>}
      </span>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </label>
  );
}

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, ...props }: SelectProps) {
  return <select className={cn(selectClass, className)} {...props} />;
}

/** A submit button that shows its pending label, so each form stops hand-rolling the same ternary. */
export function SubmitButton({ pending, pendingLabel, children, ...props }: ButtonProps & { pending?: boolean; pendingLabel?: string }) {
  return (
    <Button disabled={pending} {...props}>
      {pending ? pendingLabel ?? "Saving…" : children}
    </Button>
  );
}

/** Standard grid for a form body, so field alignment is consistent between modules. */
export function FormGrid({ columns = 3, className, children }: { columns?: 2 | 3 | 4; className?: string; children: React.ReactNode }) {
  const columnClass = columns === 2 ? "md:grid-cols-2" : columns === 4 ? "md:grid-cols-4" : "md:grid-cols-3";
  return <div className={cn("grid gap-4", columnClass, className)}>{children}</div>;
}
