import { createClient } from "@/lib/supabase/server";
import { logError, logWarn } from "@/lib/observability/log";
import { getLocale } from "@/lib/i18n/locale";
import { t } from "@/lib/i18n/messages";

/**
 * Allowances for actions worth slowing down. Each is generous for real work and only bites on
 * automated abuse — an operator inviting their crew will never notice these.
 */
export const rateLimits = {
  "member.invite": { max: 20, windowSeconds: 3600 },
  "member.role_change": { max: 30, windowSeconds: 3600 },
  "safety.sensitive_read": { max: 60, windowSeconds: 3600 },
  "report.export": { max: 30, windowSeconds: 3600 },
  "document.upload": { max: 60, windowSeconds: 3600 },
  // Far tighter than the rest, and the only one an ordinary user could plausibly hit. One request
  // returns sixty tables where every other read returns a page of twenty-five, so this is the most
  // valuable thing in the product to take at speed. Nobody needs their whole dataset four times in
  // an hour; somebody working through a list of stolen sessions does.
  "organization.export": { max: 3, windowSeconds: 3600 },
} as const;

export type RateLimitBucket = keyof typeof rateLimits;

/**
 * Records the attempt and reports whether it is within the allowance.
 *
 * Fails open when the limiter itself errors. A limiter that is unreachable should not block an
 * operator from recording production; RLS and the permission checks remain the real protection, and
 * this only exists to blunt automated abuse.
 */
export async function withinRateLimit(bucket: RateLimitBucket): Promise<boolean> {
  const { max, windowSeconds } = rateLimits[bucket];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    requested_bucket: bucket,
    max_events: max,
    window_seconds: windowSeconds,
  });

  if (error) {
    logError({ event: "ratelimit.check_failed", bucket, message: error.message });
    return true;
  }
  // Worth a line: a limit that starts biting is either abuse or an allowance set too tight, and
  // both need someone to look. A permitted attempt is not worth a line — that is every request.
  if (data === false) logWarn({ event: "ratelimit.exceeded", bucket, max, windowSeconds });
  return data !== false;
}

/**
 * Wording that tells the reader what to do without exposing the exact allowance.
 *
 * It reads the locale itself rather than taking one. Every caller is a server action or a route
 * handler that already has cookies available, and a locale parameter is one more thing a call site
 * can forget — which is how this ended up hard-coded in English behind a bilingual product in the
 * first place, on the one screen where the reader is already being told no.
 */
export async function rateLimitMessage(bucket: RateLimitBucket): Promise<string> {
  const minutes = Math.round(rateLimits[bucket].windowSeconds / 60);
  return t(await getLocale(), "rateLimitedMinutes", { minutes: String(minutes) });
}
