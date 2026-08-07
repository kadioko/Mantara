"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Module pages throw when a query fails, which without this boundary shows the framework's own error
 * screen. The wording deliberately reassures the reader that nothing they recorded has been lost,
 * because a mid-shift error on a mine site otherwise looks like data loss.
 */
export default function PlatformError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Platform route error:", error);
  }, [error]);

  return (
    <section className="mx-auto max-w-lg py-16 text-center">
      <AlertTriangle className="mx-auto size-8 text-amber-600" aria-hidden />
      <h1 className="mt-4 text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-stone-600">
        This screen could not be loaded. Nothing you have recorded has been changed or lost.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-stone-400">Reference: {error.digest}</p>}
      <div className="mt-6 flex justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <a href="/dashboard" className="inline-flex h-10 items-center rounded-md border border-stone-300 px-4 text-sm font-semibold">
          Back to dashboard
        </a>
      </div>
    </section>
  );
}
