import type { Locale } from "@/lib/i18n/messages";

/**
 * The text of the messages Mantara sends.
 *
 * Kept apart from the sending so it can be read and tested without a provider, an API key, or a
 * network. Everything here is a pure function of its arguments.
 *
 * **What an invitation may say is deliberately narrow.** It goes to an address somebody typed into a
 * form, which means it can be typed wrongly, and it is the one message that reaches a person who is
 * not yet a member of anything. It names the organization and who invited them, because without
 * those it reads as spam. It says nothing else — no site names, no figures, no other members, and no
 * indication of what the organization does. A message sent to the wrong address should disclose
 * nothing worth having.
 */

export type EmailMessage = { subject: string; text: string; html: string };

/** Escapes text for the HTML body. Names and organizations are operator-supplied. */
function escape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function invitationMessage({
  organizationName,
  invitedByName,
  signInUrl,
  locale,
}: {
  organizationName: string;
  invitedByName: string | null;
  signInUrl: string;
  locale: Locale;
}): EmailMessage {
  const inviter = invitedByName?.trim() || null;

  const subject = locale === "sw"
    ? `Umealikwa kujiunga na ${organizationName} kwenye Mantara`
    : `You have been invited to ${organizationName} on Mantara`;

  const lines = locale === "sw"
    ? [
        inviter
          ? `${inviter} amekualika kujiunga na ${organizationName} kwenye Mantara.`
          : `Umealikwa kujiunga na ${organizationName} kwenye Mantara.`,
        "Mantara ni mfumo wa kusimamia shughuli za uchimbaji madini.",
        "Fungua akaunti kwa anwani hii ya barua pepe, kisha mwaliko utakubaliwa mara utakapoingia.",
        signInUrl,
        "Kama hukutarajia ujumbe huu, unaweza kuupuuza.",
      ]
    : [
        inviter
          ? `${inviter} has invited you to join ${organizationName} on Mantara.`
          : `You have been invited to join ${organizationName} on Mantara.`,
        "Mantara is the system this company uses to run its mining operations.",
        "Create an account with this email address, and the invitation will be accepted when you sign in.",
        signInUrl,
        "If you were not expecting this, you can ignore it.",
      ];

  // The link is rendered as plain text as well as a link. Some mail clients strip anchors, and an
  // invitation nobody can act on is the same as no invitation.
  const html = [
    `<p>${escape(lines[0])}</p>`,
    `<p>${escape(lines[1])}</p>`,
    `<p>${escape(lines[2])}</p>`,
    `<p><a href="${escape(signInUrl)}">${escape(signInUrl)}</a></p>`,
    `<p style="color:#666;font-size:13px">${escape(lines[4])}</p>`,
  ].join("\n");

  return { subject, text: lines.join("\n\n"), html };
}

/** Wording for the person who sent the invitation, once the outcome is known. */
export function invitationOutcome(locale: Locale, email: string, sent: boolean) {
  if (sent) {
    return locale === "sw"
      ? `Mwaliko umetumwa kwa ${email}.`
      : `Invitation sent to ${email}.`;
  }
  // Said plainly. The invitation exists either way, and the person who sent it needs to know that
  // the other person has not been told — otherwise they wait for someone who is not coming.
  return locale === "sw"
    ? `Mwaliko umehifadhiwa kwa ${email}, lakini barua pepe haikutumwa. Tafadhali mjulishe wewe mwenyewe.`
    : `${email} has been invited, but the email could not be sent. Please tell them directly.`;
}
