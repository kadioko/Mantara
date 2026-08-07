import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pageHref, type PageInfo } from "@/lib/paging";
import { cn } from "@/lib/utils";

export function Pagination({ basePath, info, search }: { basePath: string; info: PageInfo; search: string }) {
  if (info.total === 0) return null;
  const firstRow = (info.page - 1) * info.pageSize + 1;
  const lastRow = Math.min(info.page * info.pageSize, info.total);
  const hasPrevious = info.page > 1;
  const hasNext = info.page < info.totalPages;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
      <p className="text-sm text-muted-foreground">
        Showing {firstRow}–{lastRow} of {info.total}
      </p>
      <div className="flex items-center gap-2">
        {hasPrevious ? (
          <Link href={pageHref(basePath, info.page - 1, search)} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} rel="prev">
            <ChevronLeft aria-hidden />Previous
          </Link>
        ) : (
          <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")} aria-disabled>
            <ChevronLeft aria-hidden />Previous
          </span>
        )}
        <span className="text-sm text-muted-foreground">{info.page} / {info.totalPages}</span>
        {hasNext ? (
          <Link href={pageHref(basePath, info.page + 1, search)} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} rel="next">
            Next<ChevronRight aria-hidden />
          </Link>
        ) : (
          <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-50")} aria-disabled>
            Next<ChevronRight aria-hidden />
          </span>
        )}
      </div>
    </div>
  );
}

/** A plain GET form, so searching works without JavaScript and the result is a shareable URL. */
export function SearchField({ basePath, search, placeholder }: { basePath: string; search: string; placeholder: string }) {
  return (
    <form method="get" action={basePath} className="flex items-end gap-2">
      <label className="sr-only" htmlFor="q">{placeholder}</label>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
        <Input id="q" name="q" defaultValue={search} placeholder={placeholder} className="w-56 pl-8" />
      </div>
      <button className={cn(buttonVariants({ variant: "secondary", size: "default" }))}>Search</button>
      {search && (
        <Link href={basePath} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>Clear</Link>
      )}
    </form>
  );
}
