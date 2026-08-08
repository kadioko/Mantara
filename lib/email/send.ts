import { logError, logInfo } from "@/lib/observability/log";
import type { EmailMessage } from "./messages";

/**
 * Sending email, behind a switch.
 *
 * Off unless `RESEND_API_KEY` and `EMAIL_FROM` are both set. That is the same shape as document
 * storage: a capability that needs an external account is dark until somebody has confirmed it
 * works, rather than half-working in a way nobody notices.
 *
 * Resend is called over plain HTTP with `fetch`. There is no SDK here on purpose — one endpoint and
 * a bearer token is not worth a dependency, and a dependency is worth avoiding on the path that
 * handles addresses people typed in.
 *
 * Swapping provider means changing `deliver` and nothing else; everything above it deals in an
 * `EmailMessage` and a recipient.
 */

export function emailEnabled() {
  // The site URL is required too, not only the provider credentials. Every message Mantara sends
  // contains a link to it, and an invitation whose link goes nowhere is worse than one never sent:
  // the sender believes the person was told, and the person cannot act on what they received.
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.NEXT_PUBLIC_SITE_URL);
}

export type SendResult = { sent: boolean };

/**
 * Sends a message, and never throws.
 *
 * The caller is always doing something more important than sending an email — recording an
 * invitation, usually — and that work is already committed by the time this runs. Letting a
 * provider outage turn a successful invitation into an error would lose the invitation and leave
 * the operator thinking nothing happened.
 *
 * So the contract is: report whether it went, and let the caller tell the truth about it.
 */
export async function sendEmail(to: string, message: EmailMessage, context: Record<string, string> = {}): Promise<SendResult> {
  if (!emailEnabled()) return { sent: false };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });

    if (!response.ok) {
      // The address and the body stay out of the log. A log is readable by more people than the
      // mailbox is, and this one carries somebody's email address by definition.
      logError({ event: "email.send_failed", status: response.status, ...context });
      return { sent: false };
    }

    logInfo({ event: "email.sent", ...context });
    return { sent: true };
  } catch (error) {
    logError({
      event: "email.send_failed",
      message: error instanceof Error ? error.message : String(error),
      ...context,
    });
    return { sent: false };
  }
}
