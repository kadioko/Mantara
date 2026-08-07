/**
 * Feature switches for capability that is built but not yet in service.
 *
 * Document storage depends on a Supabase Storage bucket and its policies, which cannot be exercised
 * by the migration harness or the test suite. Rather than ship a half-verified upload path that
 * fails in front of an operator, the whole surface stays dark until the bucket exists and someone
 * has confirmed it end to end against the real project.
 *
 * Switch on by setting DOCUMENTS_ENABLED=true once `0020_document_storage.sql` is applied.
 */
export function documentsEnabled() {
  return process.env.DOCUMENTS_ENABLED === "true";
}
