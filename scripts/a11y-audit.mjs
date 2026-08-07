/**
 * A static accessibility sweep over the JSX.
 *
 * This does not replace a screen-reader pass, and it says so: it catches the mechanical failures
 * that are cheap to introduce and cheap to fix — an input with no label, an icon button with no
 * name, an image with no alt text, a heading level skipped. Judgement calls (is this label
 * meaningful? is this focus order sensible?) still need a person.
 *
 * Run with: npm run a11y
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const skip = new Set(["node_modules", ".next", ".git", "scripts", "tests"]);
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
const report = (file, line, rule, detail) =>
  findings.push({ file: relative(root, file), line, rule, detail });

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");

  // Which ids are targeted by a <label htmlFor>, anywhere in the file.
  const labelled = new Set([...source.matchAll(/htmlFor=\{?["'`]?([a-zA-Z0-9_$.-]+)/g)].map((m) => m[1]));

  // A control wrapped in <label>…</label> is labelled implicitly, which is valid and is the pattern
  // most of these forms use. Track how deep we are inside a label so those are not flagged.
  let labelDepth = 0;
  const labelDepthAt = lines.map((raw) => {
    const before = labelDepth;
    // A self-closing <Field label=…> renders its own wrapping label around its children, but its
    // children sit on the same line here, so treat the whole line as inside a label.
    const opens = (raw.match(/<label\b/g) ?? []).length;
    const closes = (raw.match(/<\/label>/g) ?? []).length;
    labelDepth += opens - closes;
    return Math.max(before, labelDepth, opens > 0 ? 1 : 0);
  });

  // Controls are matched against the whole source, not line by line: an opening tag with one
  // attribute per line is common here, and a line-by-line scan sees an empty attribute list and
  // reports a control that is in fact perfectly labelled.
  const lineAt = (index) => source.slice(0, index).split("\n").length;
  // The shared primitives forward every prop, so the caller is the one who supplies the name.
  const isPrimitive = /components[\\/]ui[\\/](form|input)\.tsx$/.test(file);
  if (!isPrimitive) {
    for (const match of source.matchAll(/<(input|select|textarea|Input|Select|Textarea)\b([^>]*?)\/?>/gs)) {
      const attributes = match[2];
      const at = lineAt(match.index);
      if (/type="(hidden|submit|button)"/.test(attributes)) continue;
      if (/aria-label(?:ledby)?=/.test(attributes)) continue;
      if (/\blabel=/.test(attributes)) continue; // the wrapper renders its own label
      if (labelDepthAt[at - 1] > 0) continue; // wrapped in a <label>
      const id = /\bid=\{?["'`]?([a-zA-Z0-9_$.-]+)/.exec(attributes)?.[1];
      if (id && labelled.has(id)) continue;
      const name = /\bname="([^"]+)"/.exec(attributes)?.[1] ?? "";
      report(file, at, "control-without-label", `${match[1]} ${name}`.trim());
    }
  }

  lines.forEach((raw, index) => {
    const line = raw.trim();
    const at = index + 1;
    if (line.startsWith("//") || line.startsWith("*")) return;

    // An image needs alt text; decorative images need an explicit empty alt.
    for (const match of raw.matchAll(/<(img|Image)\b([^>]*)/g)) {
      if (!/\balt=/.test(match[2])) report(file, at, "image-without-alt", match[1]);
    }

    // A button or link whose only child is an icon has no accessible name.
    const iconOnly = /<(button|a|Link)\b(?![^>]*aria-label)[^>]*>\s*<[A-Z][A-Za-z]*\b[^>]*\/>\s*<\/(button|a|Link)>/;
    if (iconOnly.test(raw)) report(file, at, "icon-only-control-without-name", line.slice(0, 70));

    // aria-hidden on something focusable hides it from a screen reader but leaves it in tab order.
    if (/aria-hidden/.test(raw) && /<(button|a|input|Link)\b/.test(raw) && !/<[A-Z]/.test(raw)) {
      report(file, at, "aria-hidden-on-focusable", line.slice(0, 70));
    }

    // A positive tabIndex overrides document order and is nearly always a mistake.
    const tabIndex = /tabIndex=\{(\d+)\}/.exec(raw);
    if (tabIndex && Number(tabIndex[1]) > 0) report(file, at, "positive-tabindex", tabIndex[1]);

    // A click handler on a plain element is not reachable by keyboard.
    if (/<(div|span|li|tr|td)\b[^>]*onClick=/.test(raw) && !/role=/.test(raw)) {
      report(file, at, "click-handler-on-non-interactive", line.slice(0, 70));
    }
  });

  // Heading order within a file: h1 then h2 then h3, no jumps.
  const headings = [...source.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
  headings.forEach((level, index) => {
    if (index > 0 && level > headings[index - 1] + 1) {
      report(file, 0, "heading-level-skipped", `h${headings[index - 1]} then h${level}`);
    }
  });
}

const byRule = new Map();
for (const finding of findings) {
  if (!byRule.has(finding.rule)) byRule.set(finding.rule, []);
  byRule.get(finding.rule).push(finding);
}

console.log(`Scanned ${files.length} components.\n`);
if (findings.length === 0) {
  console.log("No mechanical accessibility failures found.");
} else {
  for (const [rule, list] of [...byRule.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${rule} (${list.length})`);
    for (const finding of list.slice(0, 12)) {
      console.log(`  ${finding.file}${finding.line ? `:${finding.line}` : ""}  ${finding.detail}`);
    }
    if (list.length > 12) console.log(`  ...and ${list.length - 12} more`);
    console.log("");
  }
}
process.exitCode = findings.length > 0 ? 1 : 0;
