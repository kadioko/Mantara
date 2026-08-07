import { describe, expect, it } from "vitest";
import {
  assignmentSchema,
  ppeIssueSchema,
  trainingSchema,
  workerSchema,
  workerStatusUpdateSchema,
} from "@/features/workers/schemas";

const workerId = "33333333-3333-4333-8333-333333333333";

describe("worker validation", () => {
  it("accepts a valid worker record", () => expect(workerSchema.safeParse({ fullName: "Asha Mrema", employmentType: "employee" }).success).toBe(true));
  it("requires a usable worker name", () => expect(workerSchema.safeParse({ fullName: "", employmentType: "employee" }).success).toBe(false));
  it("rejects an unknown employment type", () => expect(workerSchema.safeParse({ fullName: "Asha Mrema", employmentType: "intern" }).success).toBe(false));
});

describe("worker status validation", () => {
  it("accepts a known status", () => expect(workerStatusUpdateSchema.safeParse({ workerId, status: "terminated" }).success).toBe(true));
  it("rejects an unknown status", () => expect(workerStatusUpdateSchema.safeParse({ workerId, status: "retired" }).success).toBe(false));
});

describe("assignment validation", () => {
  const assignment = { workerId, assignmentName: "Night shift", startsOn: "2026-08-07" };

  it("accepts an open-ended assignment", () => expect(assignmentSchema.safeParse(assignment).success).toBe(true));
  it("rejects an end date before the start date", () => expect(assignmentSchema.safeParse({ ...assignment, endsOn: "2026-08-01" }).success).toBe(false));
  it("accepts an end date on the start date", () => expect(assignmentSchema.safeParse({ ...assignment, endsOn: "2026-08-07" }).success).toBe(true));
  it("requires an assignment name", () => expect(assignmentSchema.safeParse({ ...assignment, assignmentName: "" }).success).toBe(false));
});

describe("training validation", () => {
  const training = { workerId, trainingName: "Safety induction", completedOn: "2026-08-07" };

  it("accepts training without an expiry", () => expect(trainingSchema.safeParse(training).success).toBe(true));
  it("rejects an expiry before completion", () => expect(trainingSchema.safeParse({ ...training, expiresOn: "2026-08-01" }).success).toBe(false));
  it("accepts a later expiry", () => expect(trainingSchema.safeParse({ ...training, expiresOn: "2027-08-07" }).success).toBe(true));
});

describe("PPE issue validation", () => {
  const ppe = { workerId, itemName: "Safety boots", quantity: "1", issuedOn: "2026-08-07" };

  it("accepts a valid issue", () => expect(ppeIssueSchema.safeParse(ppe).success).toBe(true));
  it("rejects a zero quantity", () => expect(ppeIssueSchema.safeParse({ ...ppe, quantity: "0" }).success).toBe(false));
  it("rejects a negative quantity", () => expect(ppeIssueSchema.safeParse({ ...ppe, quantity: "-2" }).success).toBe(false));
  it("rejects a blank quantity", () => expect(ppeIssueSchema.safeParse({ ...ppe, quantity: "" }).success).toBe(false));
});
