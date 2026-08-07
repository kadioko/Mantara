"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

function subscribe(onChange: () => void) {
  window.addEventListener("offline", onChange);
  window.addEventListener("online", onChange);
  return () => {
    window.removeEventListener("offline", onChange);
    window.removeEventListener("online", onChange);
  };
}

/**
 * Tells an operator when the connection has dropped.
 *
 * This is not offline capture. Full offline capture means a service worker and a sync queue, and
 * queuing writes against a database whose rules can reject them on arrival is a design problem in
 * its own right — a shift entry accepted on a phone and refused an hour later is worse than one
 * that never appeared to save.
 *
 * What this does fix is the failure that actually costs someone their afternoon at a site with
 * patchy signal: filling in a long form, pressing save, and losing the lot to a browser error page.
 * A visible warning means they know to wait before typing, and to keep the tab open rather than
 * reload. Small, honest, and it does not pretend the data is safe when it is not.
 */
export function ConnectionStatus({ offlineLabel }: { offlineLabel: string }) {
  // The connection is an external store, so read it as one. The server snapshot is "online",
  // which keeps the server and first client render identical and avoids a hydration mismatch.
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);

  if (online) return null;

  return (
    <div
      // A polite live region: it should be announced, but not interrupt what is being read.
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-warning px-4 py-2 text-sm font-semibold text-warning-foreground"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      <span>{offlineLabel}</span>
    </div>
  );
}
