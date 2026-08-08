/**
 * The response headers that tell a browser what this application is allowed to do.
 *
 * Until now the product sent none of them. Row-level security decides who may read a record, and it
 * does that job well — but RLS runs in the database and has no opinion about what happens inside a
 * browser that is already holding a valid session. These headers cover that gap, and nothing here
 * weakens or duplicates the tenant boundary; it sits in front of it.
 *
 * Everything is a pure function of its arguments so the whole policy can be read, diffed and tested
 * without a request, a build, or a running server.
 */

/** A per-request value that lets the browser tell our own scripts from injected ones. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * The origin the browser is allowed to talk to besides our own.
 *
 * The Supabase client runs in the page, so `connect-src 'self'` alone would block every sign-in,
 * every query and every upload. Derived from the configured URL rather than written out, because a
 * hard-coded project reference would break the moment someone points a deployment at a different
 * project — and would break it as a blank screen with a console message, not an error anyone reads.
 */
function supabaseOrigin(supabaseUrl: string): string[] {
  try {
    const { origin, host } = new URL(supabaseUrl);
    // Realtime is a WebSocket to the same host, and ws: is a separate scheme as far as CSP cares.
    return [origin, `wss://${host}`];
  } catch {
    return [];
  }
}

export interface PolicyOptions {
  nonce: string;
  supabaseUrl: string;
  /** Only in production: HSTS and upgrade-insecure-requests are wrong on a local http server. */
  isProduction: boolean;
}

/** Where the browser posts a violation. Public by necessity — a blocked page has no session. */
export const cspReportPath = "/api/csp-report";

export function contentSecurityPolicy({ nonce, supabaseUrl, isProduction }: PolicyOptions): string {
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],

    // 'strict-dynamic' is the point of the nonce: it tells the browser to trust a script this
    // response vouched for, and anything that script loads, and nothing else — so an injected
    // <script src="/anything"> is refused even though it is same-origin. Without it, `'self'`
    // would readmit every same-origin URL and the nonce would be decoration.
    ["script-src", ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]],

    // Inline styles are allowed, deliberately and with regret. React sets style attributes for
    // things like a progress width, and Next inlines critical CSS. An inline style can leak through
    // a background-image URL; an inline script can do anything the session can. Refusing the second
    // is worth far more than refusing the first, and pretending otherwise would mean shipping a
    // policy so noisy nobody would ever promote it out of report-only.
    ["style-src", ["'self'", "'unsafe-inline'"]],

    ["img-src", ["'self'", "data:", "blob:", ...supabaseOrigin(supabaseUrl)]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", ["'self'", ...supabaseOrigin(supabaseUrl)]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],

    // No part of this product embeds another site, and no part of it should be embedded. Both
    // directions are closed: frame-src stops us pulling something in, frame-ancestors stops a
    // hostile page overlaying ours and collecting clicks that approve production or change a role.
    ["frame-src", ["'none'"]],
    ["frame-ancestors", ["'none'"]],

    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],

    // Every form here posts to a server action on this origin. Pinning it means an injected form
    // cannot post a session-authenticated request somewhere else.
    ["form-action", ["'self'"]],
  ];

  if (isProduction) directives.push(["upgrade-insecure-requests", []]);

  // Both report syntaxes: report-uri is deprecated and still what Firefox implements; report-to is
  // the replacement and what Chrome implements. Sending one would mean hearing from half the
  // browsers, and a report channel that is quiet for the wrong reason is worse than none.
  directives.push(["report-uri", [cspReportPath]], ["report-to", ["mantara-csp"]]);

  return directives.map(([name, values]) => [name, ...values].join(" ")).join("; ");
}

/**
 * The headers that carry no risk of breaking a page, so they are sent enforcing from the first day.
 *
 * The Content-Security-Policy is not among them — see `securityHeaders`.
 */
export function baselineHeaders({ isProduction }: { isProduction: boolean }): Record<string, string> {
  const headers: Record<string, string> = {
    // The CSV export is the reason this one matters most. It is text/csv containing text an operator
    // typed, and a browser that sniffs it as HTML would run that text on our origin.
    "X-Content-Type-Options": "nosniff",

    // frame-ancestors already says this, and this says it to browsers and embedded webviews that
    // read only the older header. The two must agree; they are asserted together in the tests.
    "X-Frame-Options": "DENY",

    // Not strict-origin-when-cross-origin, which is the common default. URLs in this product name
    // records — /production/<uuid>, /workers/<uuid> — and a referrer carrying one tells an external
    // site that a particular record exists and was being looked at. same-origin sends nothing
    // outward at all, and nothing here needs a cross-origin referrer.
    "Referrer-Policy": "same-origin",

    // A page we open keeps no handle on us, and a page that opens us gets none.
    "Cross-Origin-Opener-Policy": "same-origin",

    // Hardware this product has never asked for. Listing them denied means a dependency that starts
    // asking is refused by policy rather than by a prompt an operator would click through. Add a
    // line here on the day a feature genuinely needs one — geolocation for a site check-in is the
    // plausible first.
    "Permissions-Policy": [
      "camera=()", "microphone=()", "geolocation=()", "payment=()",
      "usb=()", "magnetometer=()", "gyroscope=()", "accelerometer=()",
    ].join(", "),

    // Where the browser sends CSP reports under the newer syntax.
    "Reporting-Endpoints": `mantara-csp="${cspReportPath}"`,
  };

  if (isProduction) {
    // Two years, subdomains included. Deliberately without `preload`: preloading is a one-way door
    // that has to be requested from browser vendors and is slow and awkward to undo, and it applies
    // to every subdomain of the registered domain including ones this project does not control.
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains";
  }

  return headers;
}

/**
 * Every security header for one response.
 *
 * **The CSP is sent report-only.** A policy this strict, added to an application that has never had
 * one, will find something — and an enforcing policy that finds something renders a blank page with
 * the explanation in a console nobody at a mine site is reading. Report-only sends the identical
 * policy, breaks nothing, and posts each would-be violation to `/api/csp-report`, where it lands in
 * the ordinary log stream. Read those for a week of real use, fix or allow what appears, then move
 * the value to `Content-Security-Policy` — one line, in `securityHeaders`.
 *
 * The nonce is issued whichever mode is in force, because the report is only worth reading if
 * Next.js could sign its own scripts. Without it every hydration script in the product reports a
 * violation, the real findings drown, and the policy never gets promoted.
 */
export function securityHeaders(options: PolicyOptions): Record<string, string> {
  return {
    ...baselineHeaders(options),
    "Content-Security-Policy-Report-Only": contentSecurityPolicy(options),
  };
}
