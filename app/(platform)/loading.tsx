import { t } from "@/lib/i18n/messages";
import { getLocale } from "@/lib/i18n/locale";
/** Skeleton shown while a module page's server queries resolve. */
export default async function PlatformLoading() {
  const locale = await getLocale();
  return (
    <div className="animate-pulse space-y-6" role="status" aria-label={t(locale, "uiLoading")}>
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-8 w-64 rounded bg-muted" />
        <div className="h-4 w-80 rounded bg-muted" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => <div key={index} className="h-24 rounded-xl bg-muted" />)}
      </div>
      <div className="h-64 rounded-xl bg-muted" />
    </div>
  );
}
