import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, likePattern, pageHref, pageInfo, readPaging } from "@/lib/paging";

describe("readPaging", () => {
  it("defaults to the first page", () => {
    const paging = readPaging({});
    expect(paging).toMatchObject({ page: 1, from: 0, to: DEFAULT_PAGE_SIZE - 1, search: "" });
  });

  it("computes the range for a later page", () => {
    const paging = readPaging({ page: "3" }, 10);
    expect(paging).toMatchObject({ page: 3, from: 20, to: 29 });
  });

  // These values come from a URL the reader can edit, so nothing here may throw.
  it("falls back to the first page for junk input", () => {
    for (const page of ["0", "-4", "abc", "", "NaN"]) {
      expect(readPaging({ page }).page, `page=${page}`).toBe(1);
    }
  });

  it("caps an absurd page number rather than computing a huge offset", () => {
    expect(readPaging({ page: "99999999" }).page).toBe(10_000);
  });

  it("takes the first value when a parameter is repeated", () => {
    expect(readPaging({ page: ["2", "7"] }).page).toBe(2);
  });

  it("trims and length-limits the search term", () => {
    expect(readPaging({ q: "  drill  " }).search).toBe("drill");
    expect(readPaging({ q: "x".repeat(500) }).search).toHaveLength(100);
  });
});

describe("likePattern", () => {
  it("wraps the term in wildcards", () => expect(likePattern("cat")).toBe("%cat%"));

  // A bare % would otherwise match everything, and a comma would end the PostgREST filter early.
  it("escapes wildcards so they are matched literally", () => {
    expect(likePattern("100%")).toBe("%100\\%%");
    expect(likePattern("a_b")).toBe("%a\\_b%");
  });

  it("escapes backslashes before other characters", () => {
    expect(likePattern("a\\b")).toBe("%a\\\\b%");
  });

  it("strips commas, which would break the filter expression", () => {
    expect(likePattern("a,b")).toBe("%ab%");
  });
});

describe("pageInfo", () => {
  it("reports at least one page when there is nothing to show", () => {
    expect(pageInfo(readPaging({}), 0).totalPages).toBe(1);
  });

  it("rounds partial pages up", () => {
    expect(pageInfo(readPaging({}, 10), 31).totalPages).toBe(4);
  });

  it("reports an exact division without an empty trailing page", () => {
    expect(pageInfo(readPaging({}, 10), 30).totalPages).toBe(3);
  });
});

describe("pageHref", () => {
  it("omits the page parameter for the first page", () => {
    expect(pageHref("/workers", 1, "")).toBe("/workers");
  });

  it("keeps the search term when paging", () => {
    expect(pageHref("/workers", 2, "asha")).toBe("/workers?page=2&q=asha");
  });

  it("encodes a search term with spaces", () => {
    expect(pageHref("/workers", 1, "night shift")).toBe("/workers?q=night+shift");
  });
});
