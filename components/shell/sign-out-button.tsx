"use client";

import { signOut } from "@/features/auth/actions";
import { clearOfflineDrafts } from "@/lib/offline/encrypted-drafts";

/**
 * Signing out, including the part that happens in the browser.
 *
 * `signOut` is a server action, and a server action cannot reach IndexedDB — so for as long as the
 * sign-out control posted straight to it, nothing could ever clear the offline drafts. That was not
 * a forgotten line; the architecture made it unreachable. Hence this client component, whose only
 * job is to do the browser half first.
 *
 * The clear is awaited rather than fired off, because the redirect that follows would otherwise race
 * it and usually win. `clearOfflineDrafts` never throws, so a browser that refuses storage still
 * signs the person out.
 */
export function SignOutButton({ label, className, children }: {
  label: string;
  className?: string;
  /** Lets a caller supply its own control — the admin header uses the shared Button. */
  children?: React.ReactNode;
}) {
  return (
    <form
      action={async () => {
        await clearOfflineDrafts();
        await signOut();
      }}
    >
      {children ?? <button type="submit" className={className}>{label}</button>}
    </form>
  );
}
