import { t } from "@/lib/i18n/messages";
import { getLocale } from "@/lib/i18n/locale";
import Link from "next/link";
import { FileQuestion } from "lucide-react";

/**
 * Detail pages call notFound() when a record is missing *or* belongs to another mine site, so the
 * wording covers both without confirming whether the record exists elsewhere.
 */
export default async function PlatformNotFound() {
  const locale = await getLocale();
  return (
    <section className="mx-auto max-w-lg py-16 text-center">
      <FileQuestion className="mx-auto size-8 text-muted-foreground" aria-hidden />
      <h1 className="mt-4 text-2xl font-bold">{t(locale, "pageNotFound")}</h1>
      <p className="mt-2 text-muted-foreground">{t(locale, "pageNotFoundDescription")}</p>
      <Link href="/dashboard" className="mt-6 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
        Back to dashboard
      </Link>
    </section>
  );
}
