import { afterEach, describe, expect, it } from "vitest";
import { documentsEnabled } from "@/lib/features";

const original = process.env.DOCUMENTS_ENABLED;
afterEach(() => {
  if (original === undefined) delete process.env.DOCUMENTS_ENABLED;
  else process.env.DOCUMENTS_ENABLED = original;
});

describe("document storage switch", () => {
  // Off unless deliberately switched on: the upload path depends on a Storage bucket that no test
  // can reach, so it must not appear in front of an operator by accident.
  it("is off when unset", () => {
    delete process.env.DOCUMENTS_ENABLED;
    expect(documentsEnabled()).toBe(false);
  });

  it("is off for anything other than the exact string true", () => {
    for (const value of ["", "false", "0", "TRUE", "yes", "1"]) {
      process.env.DOCUMENTS_ENABLED = value;
      expect(documentsEnabled(), `DOCUMENTS_ENABLED=${value}`).toBe(false);
    }
  });

  it("is on only when set to true", () => {
    process.env.DOCUMENTS_ENABLED = "true";
    expect(documentsEnabled()).toBe(true);
  });
});
