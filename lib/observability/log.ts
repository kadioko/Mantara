/**
 * Structured logging.
 *
 * One line of JSON per event, on stdout. Every hosting platform this could run on — Vercel, Fly,
 * a plain container — collects stdout, so this needs no vendor SDK and no network call, and it
 * works identically in development. Point a log drain at it and the fields are already queryable.
 *
 * The rule that matters: an operator's records never appear in a log line. Log the shape of what
 * happened — which module, which action, whether it succeeded — not the tonnes, the names, the
 * medical notes, or the money. Identifiers are fine; they are meaningless without database access,
 * and they are what makes an incident traceable.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Values allowed in a log line. Deliberately narrow, so a whole row cannot be passed by accident. */
export type LogValue = string | number | boolean | null | undefined;

export interface LogFields {
  /** What happened, as a stable dotted name: "production.entry.created", "auth.permission.denied". */
  event: string;
  /** The organization the request acted on, when there is one. Never the organization's name. */
  organizationId?: string;
  /** The acting user. Never their email or name. */
  userId?: string;
  /** How long the operation took, when it is worth knowing. */
  durationMs?: number;
  [field: string]: LogValue;
}

const levelRank: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** LOG_LEVEL trims noise in production without a redeploy. Defaults to info. */
function threshold(): number {
  const configured = process.env.LOG_LEVEL as LogLevel | undefined;
  return levelRank[configured ?? "info"] ?? levelRank.info;
}

/**
 * Fields that must never be logged, whatever a caller passes. This is a backstop, not a licence to
 * be careless: the point is that one careless call site cannot leak a name or a phone number into a
 * log aggregator that a much wider group of people can read than can read the database.
 */
const forbidden = /^(email|password|token|secret|key|fullName|full_name|phone|phoneNumber|notes|details|description|latitude|longitude|amount|quantity|tonnes)$/i;

function scrub(fields: LogFields) {
  const safe: Record<string, LogValue> = {};
  for (const [name, value] of Object.entries(fields)) {
    if (forbidden.test(name)) {
      safe[name] = "[redacted]";
      continue;
    }
    safe[name] = typeof value === "string" && value.length > 200 ? `${value.slice(0, 200)}…` : value;
  }
  return safe;
}

export function log(level: LogLevel, fields: LogFields) {
  if (levelRank[level] < threshold()) return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), ...scrub(fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logInfo = (fields: LogFields) => log("info", fields);
export const logWarn = (fields: LogFields) => log("warn", fields);
export const logError = (fields: LogFields) => log("error", fields);

/**
 * Times an operation and logs how it ended, then returns its result.
 *
 * A failure is logged with the error's message but never its stack against a user-facing path — the
 * message is enough to find the fault, and stacks in a shared log tend to carry query fragments.
 */
export async function logged<T>(event: string, context: Omit<LogFields, "event">, run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    const result = await run();
    logInfo({ ...context, event, outcome: "ok", durationMs: Date.now() - started });
    return result;
  } catch (error) {
    logError({
      ...context,
      event,
      outcome: "failed",
      durationMs: Date.now() - started,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
