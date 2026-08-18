import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DRAFT_TTL_DAYS, staleDraftIds } from "@/lib/offline/encrypted-drafts";

/**
 * Offline drafts persist a half-filled shift plan, attendance roster or safety inspection to the
 * device so a lost connection at a mine site does not cost an afternoon's work. They are encrypted
 * with a non-extractable AES-GCM key held in IndexedDB.
 *
 * What was missing was the other end: nothing ever removed them. Sign-out is a server action and a
 * server action cannot reach IndexedDB, so the drafts and their key stayed on the machine for good —
 * and a mine-site computer is usually shared.
 */

const row = (id: string, daysAgo: number) => ({
  id,
  updatedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
});

describe("which drafts are past keeping", () => {
  it("keeps one saved this morning", () => {
    expect(staleDraftIds([row("today", 0)])).toEqual([]);
  });

  it("keeps one from the weekend, because Monday is when it is wanted", () => {
    // The whole point is surviving a break in the connection, and a break can outlast a shift.
    expect(staleDraftIds([row("friday", 3)])).toEqual([]);
  });

  it("drops one older than the window", () => {
    expect(staleDraftIds([row("stale", DRAFT_TTL_DAYS + 1)])).toEqual(["stale"]);
  });

  it("drops one with no timestamp at all", () => {
    // It can never be shown to have expired, so keeping it means keeping it for ever — which is
    // exactly the state this whole change exists to end.
    expect(staleDraftIds([{ id: "ancient" }])).toEqual(["ancient"]);
  });

  it("drops one whose timestamp cannot be read", () => {
    expect(staleDraftIds([{ id: "broken", updatedAt: "not a date" }])).toEqual(["broken"]);
  });

  it("sorts the wheat from the chaff in one pass", () => {
    const ids = staleDraftIds([row("keep", 1), row("drop", 30), { id: "undated" }]);
    expect(ids.sort()).toEqual(["drop", "undated"]);
  });
});

describe("clearing on sign-out", () => {
  const signOutButton = readFileSync(join(process.cwd(), "components/shell/sign-out-button.tsx"), "utf8");

  it("the sign-out control clears the drafts before signing out", () => {
    // Order matters: signOut redirects, and a redirect beats an un-awaited storage delete.
    expect(signOutButton).toContain("clearOfflineDrafts");
    expect(signOutButton.indexOf("clearOfflineDrafts")).toBeLessThan(signOutButton.lastIndexOf("signOut()"));
  });

  it("is a client component, because a server action cannot reach IndexedDB", () => {
    // This is the reason the gap existed at all. If someone converts this back to a server
    // component the clear silently stops happening and nothing else would notice.
    expect(signOutButton.trimStart().startsWith('"use client"')).toBe(true);
  });

  it("no sign-out form posts straight to the server action any more", () => {
    // Either entry point bypassing the client wrapper reopens the gap for that surface.
    for (const file of ["components/shell/app-shell.tsx", "app/(admin)/admin/layout.tsx"]) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).not.toContain("action={signOut}");
      expect(source, file).toContain("SignOutButton");
    }
  });

  it("deletes the database rather than the rows, so the key goes too", () => {
    // Ciphertext without its key is not recoverable, which covers a row that somehow survived.
    const drafts = readFileSync(join(process.cwd(), "lib/offline/encrypted-drafts.tsx"), "utf8");
    expect(drafts).toContain("deleteDatabase");
  });

  it("never throws, so storage cannot keep somebody signed in", () => {
    const drafts = readFileSync(join(process.cwd(), "lib/offline/encrypted-drafts.tsx"), "utf8");
    const body = drafts.slice(drafts.indexOf("export async function clearOfflineDrafts"));
    expect(body).toContain("catch");
    // A blocked delete means another tab holds the database. Sign-out cannot wait on that tab.
    expect(body).toContain("onblocked");
  });
});
