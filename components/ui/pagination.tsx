import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pageHref, type PageInfo } from "@/lib/paging";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

export async function Pagination({ basePath, info, search }: { basePath: string; info: PageInfo; search: string }) {
  if (info.total === 0) return null;
  const locale = await getLocale();
  const firstRow = (info.page - 1) * info.pageSize + 1;
  const lastRow = Math.min(info.page * info.pageSize, info.total);
  const hasPrevious = info.page > 1;
  const hasNext = info.page < info.totalPages;
  const previous = t(locale, "previous");
  const next = t(locale, "next");
  const outline = cn(buttonVariants({ variant: "outline", size: "sm" }));

  return (
    <nav
      aria-label={t(locale, "pagination")}
      className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3"
    >
      <p className="text-sm text-muted-foreground">
        {t(locale, "showingRange", { first: String(firstRow), last: String(lastRow), total: String(info.total) })}
      </p>
      <div className="flex items-center gap-2">
        {hasPrevious ? (
          <Link href={pageHref(basePath, info.page - 1, search)} className={outline} rel="prev">
            <ChevronLeft aria-hidden />{previous}
          </Link>
        ) : (
          <span className={cn(outline, "pointer-events-none opacity-50")} aria-disabled="true">
            <ChevronLeft aria-hidden />{previous}
          </span>
        )}
        <span className="text-sm text-muted-foreground">
          {t(locale, "pageOfPages", { page: String(info.page), pages: String(info.totalPages) })}
        </span>
        {hasNext ? (
          <Link href={pageHref(basePath, info.page + 1, search)} className={outline} rel="next">
            {next}<ChevronRight aria-hidden />
          </Link>
        ) : (
          <span className={cn(outline, "pointer-events-none opacity-50")} aria-disabled="true">
            {next}<ChevronRight aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}

/** A plain GET form, so searching works without JavaScript and the result is a shareable URL. */
export async function SearchField({ basePath, search, placeholder }: { basePath: string; search: string; placeholder: string }) {
  const locale = await getLocale();
  return (
    <form method="get" action={basePath} role="search" className="flex items-end gap-2">
      <label className="sr-only" htmlFor="q">{placeholder}</label>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
        <Input id="q" name="q" defaultValue={search} placeholder={placeholder} className="w-56 pl-8" />
      </div>
      <button className={cn(buttonVariants({ variant: "secondary", size: "default" }))}>{t(locale, "search")}</button>
      {search && (
        <Link href={basePath} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>{t(locale, "clear")}</Link>
      )}
    </form>
  );
}
