import Link from "next/link";
import { FileQuestion } from "lucide-react";

/**
 * Detail pages call notFound() when a record is missing *or* belongs to another mine site, so the
 * wording covers both without confirming whether the record exists elsewhere.
 */
export default function PlatformNotFound() {
  return (
    <section className="mx-auto max-w-lg py-16 text-center">
      <FileQuestion className="mx-auto size-8 text-stone-400" aria-hidden />
      <h1 className="mt-4 text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-stone-600">That record does not exist, or it belongs to another mine site.</p>
      <Link href="/dashboard" className="mt-6 inline-flex h-10 items-center rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white">
        Back to dashboard
      </Link>
    </section>
  );
}
