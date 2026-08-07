/**
 * Checks the design-token palette against WCAG contrast minimums, in both themes.
 *
 * This exists because a contrast failure shipped once already: the workspace switcher sat at 1.58:1,
 * which is unreadable, and nothing caught it until someone looked at the running site. Tokens are
 * written in oklch, so the check has to convert oklch to sRGB properly — eyeballing the lightness
 * number is what produced the wrong answer the first time.
 *
 * Run with: npm run contrast
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

/** oklch -> oklab -> linear sRGB. */
function oklchToLinearRgb(lightness, chroma, hueDegrees) {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.min(1, Math.max(0, channel))); // clamp: some tokens sit outside sRGB
}

/** WCAG relative luminance. The tokens are already linear at this point, so no de-gamma step. */
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const contrast = (first, second) => {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
};

/** Reads one `:root {…}` or `.dark {…}` block into a map of token name to oklch triple. */
function readTheme(selector) {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`No ${selector} block in globals.css`);
  const body = css.slice(start, css.indexOf("\n}", start));
  const tokens = new Map();
  for (const match of body.matchAll(/--([a-z-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g)) {
    tokens.set(match[1], oklchToLinearRgb(Number(match[2]), Number(match[3]), Number(match[4])));
  }
  return tokens;
}

// Text pairs need 4.5:1. Non-text pairs — borders, focus rings, the edge of a control — need 3:1,
// because they carry meaning by shape and position as well as by colour.
const textPairs = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["destructive-foreground", "destructive"],
  ["success-foreground", "success"],
  ["warning-foreground", "warning"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  // The success and destructive badges paint these as text over a faint tint of themselves, so the
  // token has to survive as text on a card, not only as a button background.
  ["success", "card"],
  ["destructive", "card"],
];
const nonTextPairs = [
  // --input is the only thing that shows where a text field ends, so 1.4.11 applies to it.
  ["input", "card"],
  ["input", "background"],
  ["ring", "background"],
  ["ring", "card"],
  ["primary", "background"],
];

// --border draws dividers and card edges. Those are decorative under 1.4.11 — the card is already
// distinguishable by its background, and no control's boundary depends on the line. Meeting 3:1
// there would mean drawing every table rule in mid-grey, which is a real readability cost for no
// accessibility gain. Recorded here rather than dropped silently, so the reasoning survives.
const decorative = [["border", "background"], ["border", "card"]];

let failures = 0;
for (const [name, selector] of [["light", ":root {"], ["dark", ".dark {"]]) {
  const tokens = readTheme(selector);
  console.log(`\n${name} theme`);
  for (const [front, back] of decorative) {
    const ratio = contrast(tokens.get(front), tokens.get(back));
    console.log(`  --    ${ratio.toFixed(2)}:1  ${front} on ${back} (decorative, exempt)`);
  }
  for (const [pairs, minimum, kind] of [[textPairs, 4.5, "text"], [nonTextPairs, 3, "non-text"]]) {
    for (const [front, back] of pairs) {
      const a = tokens.get(front);
      const b = tokens.get(back);
      if (!a || !b) {
        console.log(`  ?     ${front} on ${back} — token missing`);
        failures += 1;
        continue;
      }
      const ratio = contrast(a, b);
      const passes = ratio >= minimum;
      if (!passes) failures += 1;
      console.log(`  ${passes ? "ok  " : "FAIL"}  ${ratio.toFixed(2)}:1  ${front} on ${back} (${kind}, needs ${minimum}:1)`);
    }
  }
}

console.log(failures === 0 ? "\nAll token pairs meet WCAG AA." : `\n${failures} pair(s) below the minimum.`);
process.exitCode = failures > 0 ? 1 : 0;
