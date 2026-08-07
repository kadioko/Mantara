import { describe, expect, it } from "vitest";
import { attendanceSchema, workerSchema } from "@/features/workers/schemas";

describe("worker validation", () => {
  it("accepts a valid worker record", () => expect(workerSchema.safeParse({ fullName: "Asha Mrema", employmentType: "employee" }).success).toBe(true));
  it("requires a usable worker name", () => expect(workerSchema.safeParse({ fullName: "", employmentType: "employee" }).success).toBe(false));

  it("validates daily attendance states", () => {
    expect(attendanceSchema.safeParse({ workerId: "d70e77cf-5b7b-4c4f-8104-8cc4ba6a1b3c", attendanceDate: "2026-08-07", status: "present" }).success).toBe(true);
    expect(attendanceSchema.safeParse({ workerId: "not-a-uuid", attendanceDate: "tomorrow", status: "away" }).success).toBe(false);
  });
});
