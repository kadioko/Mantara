import { describe, expect, it } from "vitest";
import {
  allMessageKeys,
  supportedLocales,
  t,
  translationCoverage,
  translationGaps,
} from "@/lib/i18n/messages";

describe("locale fallback", () => {
  // The invariant the fallback exists to guarantee: whatever a translator has or has not got to,
  // every key renders readable text in every locale. Without the fallback a missing Swahili key
  // would render as nothing at all, which is worse for an operator than reading English.
  it("resolves every key in every locale to non-empty text", () => {
    for (const locale of supportedLocales) {
      for (const key of allMessageKeys()) {
        const rendered = t(locale, key);
        expect(typeof rendered, `${locale}.${key}`).toBe("string");
        expect(rendered.trim().length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  const gaps = translationGaps("sw");
  it.skipIf(gaps.length === 0)("renders an untranslated key as its English text", () => {
    for (const key of gaps) expect(t("sw", key), key).toBe(t("en", key));
  });

  it("substitutes placeholders the same way in every locale", () => {
    for (const locale of supportedLocales) {
      const rendered = t(locale, "showingRange", { first: "1", last: "25", total: "204" });
      expect(rendered).toContain("25");
      expect(rendered).toContain("204");
      expect(rendered).not.toContain("{");
    }
  });

  it("leaves an unsupplied placeholder visible rather than blanking it", () => {
    // Visible braces are a bug report. A silently empty slot is a bug nobody notices.
    expect(t("en", "showingRange", { first: "1" })).toContain("{last}");
  });
});

describe("translation coverage", () => {
  it("reports English as complete by definition", () => {
    const { percent, total, translated } = translationCoverage("en");
    expect(percent).toBe(100);
    expect(translated).toBe(total);
    expect(translationGaps("en")).toEqual([]);
  });

  it("keeps Swahili at or above the coverage it has today", () => {
    // A ratchet, not a freeze: adding an English key ahead of its Swahili is allowed on purpose,
    // but this fails if the catalogue drifts far enough that the product reverts to English.
    expect(translationCoverage("sw").percent).toBeGreaterThanOrEqual(90);
  });
});
