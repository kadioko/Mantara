import { describe, expect, it } from "vitest";
import { t } from "@/lib/i18n/messages";

describe("translations", () => {
  it("provides English and Kiswahili copy", () => {
    expect(t("en", "workers")).toBe("Workers");
    expect(t("sw", "workers")).toBe("Wafanyakazi");
  });

  it("interpolates translated values", () => {
    expect(t("sw", "workersDescription", { site: "Nyamongo" })).toContain("Nyamongo");
  });
});
