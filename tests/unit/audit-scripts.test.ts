import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The audits must be able to fail.
 *
 * `scripts/a11y-audit.mjs` spent a while reporting "No mechanical accessibility failures found"
 * while its image rule could not match anything at all: an edit had replaced the two characters
 * `\` and `b` in the pattern with a single literal backspace byte (0x08). The regex still compiled,
 * still ran, and never matched. A green light from a blind check is worse than a red one, because
 * nobody looks again.
 *
 * The same corruption hit `tests/unit/schema-contract.test.ts` once before, which is why this
 * checks every audit script rather than only the one that was caught.
 */

const scripts = ["a11y-audit.mjs", "contrast-audit.mjs", "i18n-report.mjs"];

const read = (name: string) => readFileSync(join(process.cwd(), "scripts", name), "utf8");

const hex = (character: string) => `0x${character.charCodeAt(0).toString(16).padStart(2, "0")}`;

describe("the audit scripts are readable code", () => {
  for (const name of scripts) {
    it(`${name} contains no stray control characters`, () => {
      const source = read(name);
      // Tab, newline and carriage return are the only control characters legitimate in source.
      const stray = [...source].filter((character) => {
        const code = character.charCodeAt(0);
        return code < 32 && code !== 9 && code !== 10 && code !== 13;
      });
      expect(stray.map(hex), `${name} holds a mangled escape, most likely a backslash-b`).toEqual([]);
    });
  }
});

describe("the accessibility rules still have teeth", () => {
  /**
   * Pulls the scanner's own image pattern out of its source and exercises it against a fragment, so
   * this asserts the rule itself rather than the current state of the repository. Asserting the
   * repository is what failed before: the code was clean, so the broken rule looked correct.
   */
  const patternFrom = (expression: RegExp, label: string) => {
    const found = expression.exec(read("a11y-audit.mjs"));
    expect(found, `could not find ${label} in a11y-audit.mjs`).not.toBeNull();
    const literal = found![1];
    const end = literal.lastIndexOf("/");
    return new RegExp(literal.slice(1, end), literal.slice(end + 1));
  };

  it("the image pattern matches an actual image tag", () => {
    // The corrupted version compiled and matched nothing. This is the assertion that would have
    // caught it on the day it happened.
    const rule = patternFrom(/raw\.matchAll\((\/<\(img\|Image\)[^)]*\/g)\)/, "the image rule");
    expect('<img src="x.png" />').toMatch(rule);
    expect('<Image src="x.png" />').toMatch(rule);
    expect("<imgur>").not.toMatch(rule);
  });

  it("the alt check matches an alt attribute and nothing else", () => {
    const rule = patternFrom(/if \(!(\/[^)]*alt=\/)\.test/, "the alt check");
    expect('alt="Mantara"').toMatch(rule);
    expect('src="x.png"').not.toMatch(rule);
    // "salt=" must not read as an alt attribute; that is what the word boundary is for.
    expect("salt=3").not.toMatch(rule);
  });

  it("reads a tag whose props run over several lines", () => {
    // The false positive that started this: an <Image> carrying alt on its second line was reported
    // as missing it. Fixing that is what silently disabled the rule.
    expect(read("a11y-audit.mjs")).toContain("wholeTag");
  });
});
