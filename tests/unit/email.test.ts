import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invitationMessage, invitationOutcome } from "@/lib/email/messages";
import { emailEnabled, sendEmail } from "@/lib/email/send";

const invitation = (overrides: Partial<Parameters<typeof invitationMessage>[0]> = {}) =>
  invitationMessage({
    organizationName: "Acme Mining",
    invitedByName: "Asha Mwangi",
    signInUrl: "https://mantara.example/register",
    locale: "en",
    ...overrides,
  });

describe("what an invitation says", () => {
  it("names the organization and who invited them", () => {
    // Without both, it reads as spam and gets deleted — which is the same as never sending it.
    const message = invitation();
    expect(message.subject).toContain("Acme Mining");
    expect(message.text).toContain("Asha Mwangi");
    expect(message.text).toContain("Acme Mining");
  });

  it("still works when the inviter has no name recorded", () => {
    const message = invitation({ invitedByName: null });
    expect(message.text).toContain("Acme Mining");
    expect(message.text).not.toContain("null");
    expect(message.text).not.toContain("undefined");
  });

  it("treats a blank name as no name", () => {
    expect(invitation({ invitedByName: "   " }).text).not.toContain("  has invited");
  });

  it("carries the link as text as well as a link", () => {
    // Some mail clients strip anchors, and an invitation nobody can act on is no invitation.
    const message = invitation();
    expect(message.text).toContain("https://mantara.example/register");
    expect(message.html).toContain('href="https://mantara.example/register"');
    expect(message.html).toContain(">https://mantara.example/register<");
  });

  it("is written in Kiswahili when that is the locale", () => {
    const message = invitation({ locale: "sw" });
    expect(message.subject).toContain("Umealikwa");
    expect(message.text).toContain("Acme Mining");
  });
});

describe("what an invitation must not say", () => {
  // It goes to an address somebody typed into a form, so it can go to the wrong person. A message
  // delivered in error should disclose nothing worth having.
  it("carries no operational detail at all", () => {
    const message = invitation();
    const body = `${message.subject} ${message.text} ${message.html}`.toLowerCase();
    for (const leak of ["tonne", "litre", "production", "fuel", "expense", "salary", "worker", "site"]) {
      expect(body, leak).not.toContain(leak);
    }
  });

  it("escapes an organization name that contains markup", () => {
    // Organization and member names are operator-supplied, and this body is HTML.
    const message = invitation({ organizationName: '<script>alert("x")</script>' });
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
  });

  it("escapes a person's name too", () => {
    const message = invitation({ invitedByName: 'Asha" onload="evil()' });
    expect(message.html).not.toContain('onload="evil()"');
    expect(message.html).toContain("&quot;");
  });
});

describe("telling the sender what happened", () => {
  it("says it was sent when it was", () => {
    expect(invitationOutcome("en", "crew@example.com", true)).toContain("sent");
  });

  it("says plainly when it was not, and what to do", () => {
    // The invitation exists either way. Someone who thinks the email went will wait for a person
    // who is never coming.
    const message = invitationOutcome("en", "crew@example.com", false);
    expect(message).toMatch(/could not be sent/i);
    expect(message).toMatch(/tell them directly/i);
    expect(message).toContain("crew@example.com");
  });

  it("says both in Kiswahili", () => {
    expect(invitationOutcome("sw", "crew@example.com", true)).toContain("umetumwa");
    expect(invitationOutcome("sw", "crew@example.com", false)).toMatch(/haikutumwa/);
  });
});

describe("sending", () => {
  const original = {
    key: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM,
    site: process.env.NEXT_PUBLIC_SITE_URL,
  };

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (original.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = original.key;
    if (original.from === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = original.from;
    if (original.site === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = original.site;
  });

  it("is off unless the key, the sender address and the site URL are all set", () => {
    // The site URL counts because every message carries a link to it. An invitation whose link goes
    // nowhere is worse than one never sent: the sender believes the person was told, and the person
    // cannot act on what arrived.
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(emailEnabled()).toBe(false);

    process.env.RESEND_API_KEY = "test-key";
    expect(emailEnabled(), "a key with no from address").toBe(false);

    process.env.EMAIL_FROM = "mantara@example.com";
    expect(emailEnabled(), "no site URL to link to").toBe(false);

    process.env.NEXT_PUBLIC_SITE_URL = "https://mantara.example";
    expect(emailEnabled()).toBe(true);
  });

  it("sends nothing and reports nothing sent when it is off", async () => {
    delete process.env.RESEND_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await sendEmail("crew@example.com", invitation())).toEqual({ sent: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports not sent rather than throwing when the provider refuses", async () => {
    // The caller has already committed the invitation. Throwing here would lose it.
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "mantara@example.com";
    process.env.NEXT_PUBLIC_SITE_URL = "https://mantara.example";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 422 }));
    await expect(sendEmail("crew@example.com", invitation())).resolves.toEqual({ sent: false });
  });

  it("reports not sent rather than throwing when the network fails", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "mantara@example.com";
    process.env.NEXT_PUBLIC_SITE_URL = "https://mantara.example";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    await expect(sendEmail("crew@example.com", invitation())).resolves.toEqual({ sent: false });
  });

  it("keeps the address and the body out of the log", async () => {
    // A log is readable by more people than a mailbox is, and this path handles an address by
    // definition. lib/observability/log.ts redacts by field name; this checks the call site too.
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "mantara@example.com";
    process.env.NEXT_PUBLIC_SITE_URL = "https://mantara.example";
    const lines: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line: unknown) => { lines.push(String(line)); });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 500 }));

    await sendEmail("crew@example.com", invitation(), { organizationId: "org-1" });

    expect(lines.join(" ")).not.toContain("crew@example.com");
    expect(lines.join(" ")).not.toContain("Acme Mining");
    expect(lines.join(" ")).toContain("email.send_failed");
  });

  it("posts the message to the provider with the configured sender", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "mantara@example.com";
    process.env.NEXT_PUBLIC_SITE_URL = "https://mantara.example";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    expect(await sendEmail("crew@example.com", invitation())).toEqual({ sent: true });

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.to).toEqual(["crew@example.com"]);
    expect(body.from).toBe("mantara@example.com");
    expect(body.subject).toContain("Acme Mining");
    expect(body.text).toBeTruthy();
    expect(body.html).toBeTruthy();
  });
});
