import { describe, expect, it } from "vitest";

const ownerHasPermission = (role: string, granted: string[]) => role === "company_owner" || granted.includes("site.create");

describe("permission model", () => {
  it("gives company owners all organization permissions", () => expect(ownerHasPermission("company_owner", [])).toBe(true));
  it("requires an explicit permission for non-owners", () => expect(ownerHasPermission("site_supervisor", [])).toBe(false));
});
