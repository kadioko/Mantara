export const DEFAULT_PAGE_SIZE = 25;

export type PageParams = { page?: string | string[]; q?: string | string[] };

export type Paging = {
  page: number;
  pageSize: number;
  /** Inclusive bounds for a Supabase `.range()` call. */
  from: number;
  to: number;
  search: string;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Reads page and search state from the query string. Anything unparseable falls back to the first
 * page rather than erroring, because these values arrive from a URL the reader can edit.
 */
export function readPaging(params: PageParams, pageSize = DEFAULT_PAGE_SIZE): Paging {
  const requested = Number.parseInt(first(params.page) ?? "1", 10);
  const page = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 10_000) : 1;
  const search = (first(params.q) ?? "").trim().slice(0, 100);
  const from = (page - 1) * pageSize;
  return { page, pageSize, from, to: from + pageSize - 1, search };
}

/**
 * Escapes a search term for a PostgREST `ilike` pattern. Without this a `%` typed by the reader
 * silently matches everything, and a `,` would end the filter early.
 */
export function likePattern(search: string) {
  return `%${search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_").replaceAll(",", "")}%`;
}

export type PageInfo = { page: number; pageSize: number; total: number; totalPages: number };

export function pageInfo(paging: Paging, total: number): PageInfo {
  return {
    page: paging.page,
    pageSize: paging.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / paging.pageSize)),
  };
}

/** Builds a URL for another page, preserving the current search term. */
export function pageHref(basePath: string, page: number, search: string) {
  const query = new URLSearchParams();
  if (page > 1) query.set("page", String(page));
  if (search) query.set("q", search);
  const suffix = query.toString();
  return suffix ? `${basePath}?${suffix}` : basePath;
}
