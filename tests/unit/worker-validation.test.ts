import { describe, expect, it } from "vitest";
import { workerSchema } from "@/features/workers/schemas";

describe("worker validation", () => {
  it("accepts a valid worker record", () => expect(workerSchema.safeParse({ fullName: "Asha Mrema", employmentType: "employee" }).success).toBe(true));
  it("requires a usable worker name", () => expect(workerSchema.safeParse({ fullName: "", employmentType: "employee" }).success).toBe(false));
});
