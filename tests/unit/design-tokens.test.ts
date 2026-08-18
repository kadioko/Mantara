import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Screens must take their colours from the design tokens, not from Tailwind's stock palette.
 *
 * `npm run contrast` checks every token pair against WCAG AA in both themes — and it structurally
 * cannot see a raw class like `bg-orange-50`, because that is not a token. So the audit passed
 * while the maintenance board rendered an "on hold" chip as a near-white block on a dark card, and
 * the dashboard hero kept a hardcoded white gradient in dark mode with the organization's own name
 * in light text on top of it, on the first screen after sign-in.
 *
 * This closes the hole the contrast audit cannot reach. It scans `className` strings only, so a
 * comment naming one of these classes does not trip it.
 */

const palette = /\b(?:text|bg|border|ring|from|via|to|fill|stroke|divide|outline|shadow|accent|caret|decoration)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/g;

/**
 * The workspace sidebar and the brand mark carry the Mantara colour directly, which the README
 * states as the single deliberate exception. Anything else is an oversight.
 */
const allowed = ["components/shell", "components/brand"];

const files = () => {
  const roots = [join(process.cwd(), "app"), join(process.cwd(), "components"), join(process.cwd(), "features")];
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (["node_modules", ".next", ".git", ".claude"].includes(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".tsx")) found.push(full);
    }
  };
  for (const root of roots) walk(root);
  return found;
};

/** Palette classes inside className strings, which is the only place they take effect. */
const offences = (source: string) => {
  const classNames = [...source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g)]
    .map((match) => match[1] ?? match[2] ?? match[3] ?? "");
  return classNames.flatMap((value) => [...value.matchAll(palette)].map((match) => match[0]));
};

describe("colour comes from the tokens", () => {
  it("no screen uses Tailwind's stock palette", () => {
    const bad: string[] = [];
    for (const file of files()) {
      const path = relative(process.cwd(), file).split(sep).join("/");
      if (allowed.some((prefix) => path.startsWith(prefix))) continue;
      const found = offences(readFileSync(file, "utf8"));
      if (found.length) bad.push(`${path}: ${[...new Set(found)].join(", ")}`);
    }
    expect(bad, `use design tokens (bg-card, text-muted-foreground, bg-warning/25 …) instead:\n${bad.join("\n")}`).toEqual([]);
  });

  it("still finds them when they are there", () => {
    // Otherwise the check above passes because the regex stopped matching, which is how a guard
    // quietly becomes decoration.
    expect(offences('<div className="bg-orange-50 text-orange-800" />')).toEqual(["bg-orange-50", "text-orange-800"]);
    expect(offences('<div className={`rounded ${x} border-emerald-900`} />')).toEqual(["border-emerald-900"]);
  });

  it("ignores a class name that only appears in a comment", () => {
    expect(offences('// this was bg-orange-50 once\n<div className="bg-card" />')).toEqual([]);
  });
});
