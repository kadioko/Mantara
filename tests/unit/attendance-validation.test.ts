import { describe, expect, it } from "vitest";
import { attendanceRosterSchema } from "@/features/workers/schemas";

const workerId = "11111111-1111-4111-8111-111111111111";

describe("attendance validation", () => {
  it("accepts a roster with a valid date and status", () =>
    expect(attendanceRosterSchema.safeParse({ date: "2026-08-07", entries: [{ workerId, status: "present" }] }).success).toBe(true));

  it("rejects an empty roster", () =>
    expect(attendanceRosterSchema.safeParse({ date: "2026-08-07", entries: [] }).success).toBe(false));

  it("rejects an unknown status", () =>
    expect(attendanceRosterSchema.safeParse({ date: "2026-08-07", entries: [{ workerId, status: "holiday" }] }).success).toBe(false));

  it("rejects a malformed date", () =>
    expect(attendanceRosterSchema.safeParse({ date: "07/08/2026", entries: [{ workerId, status: "present" }] }).success).toBe(false));

  it("rejects a non-uuid worker id", () =>
    expect(attendanceRosterSchema.safeParse({ date: "2026-08-07", entries: [{ workerId: "abc", status: "present" }] }).success).toBe(false));
});
