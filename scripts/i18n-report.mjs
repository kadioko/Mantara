/**
 * Reports what still needs a translator.
 *
 * Two different gaps, and they need different work:
 *   1. Catalogue gaps  — a key exists in English but not in another locale. t() falls back to
 *                        English so nothing breaks, but the screen is half-translated.
 *   2. Uncatalogued UI — user-facing text written directly into a component, so it can never be
 *                        translated at all. These have to be lifted into the catalogue first.
 *
 * Run with: npm run i18n:report
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();

// The catalogue is TypeScript, so read the keys out of the source rather than importing it.
const source = readFileSync(join(root, "lib/i18n/messages.ts"), "utf8");
const sectionKeys = (name) => {
  const start = source.indexOf(name);
  const body = source.slice(start, source.indexOf("\n};", start) < 0 ? source.indexOf("\n} as const;", start) : source.indexOf("\n};", start));
  return new Set([...body.matchAll(/(?:^|[{,]\s*|\n\s*)([a-zA-Z][a-zA-Z0-9]*)\s*:\s*"/g)].map((m) => m[1]));
};
const english = sectionKeys("const english = {");
const swahili = sectionKeys("const swahili:");

const missing = [...english].filter((key) => !swahili.has(key));
const percent = Math.floor(((english.size - missing.length) / english.size) * 100);

console.log(`Catalogue: ${english.size} English keys.`);
console.log(`Swahili:   ${english.size - missing.length} translated (${percent}%), ${missing.length} missing.`);
if (missing.length) console.log(`  Missing: ${missing.join(", ")}`);

// Text sitting in JSX that no translator can reach. Deliberately conservative: it looks for text
// nodes between tags and for the props that are read aloud or shown to a person.
// ".claude" holds git worktrees — a full, often stale second copy of this codebase. Walking
// into it reports findings against code that is not the code being audited, and doubles every
// count. Two phantom accessibility failures were reported from there before it was excluded.
const skip = new Set(["node_modules", ".next", ".git", ".claude", "scripts", "tests"]);
const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    if (skip.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith(".tsx")) files.push(full);
  }
};
walk(root);

const findings = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (line.includes("t(locale,") || line.trimStart().startsWith("//") || line.trimStart().startsWith("*") || line.trimStart().startsWith("type ")) return;
    const between = [...line.matchAll(/>\s*([A-Z][a-zA-Z][^<>{}]{3,})</g)].map((m) => m[1].trim());
    // `description`, `hint` and `eyebrow` belong here as much as `label` does — they are the
    // sentences under a panel heading that say what a screen is for, and a reader who cannot read
    // those is worse off than one missing a field label. Leaving them out understated this count.
    const props = [...line.matchAll(/\b(placeholder|aria-label|title|label|alt|description|hint|eyebrow)="([^"]{3,})"/g)].map((m) => m[2]);
    for (const phrase of between) {
      if (/^[A-Z0-9_.-]+$/.test(phrase)) continue; // constants and codes, not prose
      findings.push({ file: relative(root, file), line: index + 1, phrase, kind: "text" });
    }
    for (const phrase of props) {
      if (/^[A-Z0-9_.-]+$/.test(phrase)) continue;
      findings.push({ file: relative(root, file), line: index + 1, phrase, kind: "attribute" });
    }
  });
}

const byFile = new Map();
for (const finding of findings) byFile.set(finding.file, (byFile.get(finding.file) ?? 0) + 1);
const ranked = [...byFile.entries()].sort((a, b) => b[1] - a[1]);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ missing, findings }, null, 2));
  process.exit(findings.length || missing.length ? 1 : 0);
}
if (process.argv.includes("--phrases")) {
  console.log([...new Set(findings.map((finding) => finding.phrase))].sort().join("\n"));
  process.exit(0);
}

console.log(`\nUncatalogued UI text: ${findings.length} phrases across ${byFile.size} files.`);
console.log(`Unique uncatalogued phrases: ${new Set(findings.map((finding) => finding.phrase)).size}.`);
console.log(`Text nodes: ${findings.filter((finding) => finding.kind === "text").length}; attributes: ${findings.filter((finding) => finding.kind === "attribute").length}.`);
console.log("Worst first — lifting these into lib/i18n/messages.ts is what unblocks translation:");
for (const [file, count] of ranked.slice(0, 20)) console.log(`  ${String(count).padStart(4)}  ${file}`);
if (ranked.length > 20) console.log(`  ...and ${ranked.length - 20} more files.`);
