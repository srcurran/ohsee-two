/**
 * Preflight URL reachability check used before kicking off a report run.
 *
 * The runner used to happily march through every breakpoint × every page
 * even when the configured prod/dev URL was unreachable, producing a
 * "completed" report with zero screenshots. This module surfaces the most
 * common misconfigurations (typing `https://` against an http-only host,
 * the dev server not running, a typo in the hostname) up front so the API
 * can reject the run before the user watches it churn for minutes.
 *
 * Returns a structured result so callers can log the kind separately from
 * the user-facing reason if they want.
 */

export type UrlReachabilityKind =
  | "ssl"
  | "refused"
  | "dns"
  | "timeout"
  | "http_error"
  | "other";

export type UrlReachabilityResult =
  | { ok: true }
  | { ok: false; kind: UrlReachabilityKind; reason: string };

const TIMEOUT_MS = 8_000;

/** Read a string-typed `code` from `err.cause` if present (Node fetch shape). */
function getErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "cause" in err) {
    const cause = (err as { cause: unknown }).cause;
    if (cause && typeof cause === "object" && "code" in cause) {
      const code = (cause as { code: unknown }).code;
      if (typeof code === "string") return code;
    }
  }
  return undefined;
}

/**
 * Hit `url` with HEAD (falling back to GET) and bucket any failure into a
 * specific UrlReachabilityKind. A 4xx response is treated as reachable —
 * something is talking on the other end, just gating it. Only 5xx and
 * transport-level failures count as unreachable.
 */
export async function checkUrlReachable(rawUrl: string): Promise<UrlReachabilityResult> {
  // Mirror the runner's normalization: bare hostnames get http://.
  const url = /^https?:\/\//.test(rawUrl) ? rawUrl : `http://${rawUrl}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });
    // Some servers don't implement HEAD — retry as GET so we don't false-flag them.
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        redirect: "follow",
      });
    }
    if (res.status >= 500) {
      return {
        ok: false,
        kind: "http_error",
        reason: `responded with HTTP ${res.status}`,
      };
    }
    return { ok: true };
  } catch (err: unknown) {
    return classifyError(err, url);
  } finally {
    clearTimeout(timer);
  }
}

function classifyError(err: unknown, _url: string): UrlReachabilityResult {
  const message = err instanceof Error ? err.message : String(err);
  const code = getErrorCode(err);

  if (err instanceof Error && err.name === "AbortError") {
    return {
      ok: false,
      kind: "timeout",
      reason: `didn't respond within ${TIMEOUT_MS / 1000} seconds`,
    };
  }

  // SSL handshake failures — the most actionable case. Hitting an http-only
  // port over https surfaces here as `EPROTO` / "wrong version number" /
  // various ERR_SSL_* codes depending on the Node version.
  const sslSignals = [
    "ERR_SSL",
    "WRONG_VERSION_NUMBER",
    "wrong version number",
    "EPROTO",
    "self-signed",
    "self signed",
    "unable to verify",
  ];
  if (
    (code && (code.startsWith("ERR_SSL") || code === "EPROTO")) ||
    sslSignals.some((s) => message.includes(s))
  ) {
    return { ok: false, kind: "ssl", reason: "couldn't complete an HTTPS handshake" };
  }

  switch (code) {
    case "ECONNREFUSED":
      return { ok: false, kind: "refused", reason: "refused the connection" };
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return { ok: false, kind: "dns", reason: "couldn't be reached" };
    case "ECONNRESET":
      return { ok: false, kind: "refused", reason: "reset the connection" };
    case "ETIMEDOUT":
      return { ok: false, kind: "timeout", reason: "timed out connecting" };
  }

  // Anything we don't recognize — include the raw message so the user has
  // *something* to act on.
  return { ok: false, kind: "other", reason: `failed: ${message}` };
}

/** A single failed URL check, in the shape the API hands back to the client. */
export interface UrlReachabilityIssue {
  side: "prod" | "dev";
  url: string;
  kind: UrlReachabilityKind;
  reason: string;
}

/**
 * Convenience wrapper: check both prod and dev in parallel. On failure
 * returns structured `issues` so the client can build a hierarchical
 * error display (eyebrow / title / body) instead of getting a single
 * concatenated string.
 */
export async function checkProjectUrlsReachable(
  prodUrl: string,
  devUrl: string,
): Promise<{ ok: true } | { ok: false; error: string; issues: UrlReachabilityIssue[] }> {
  const [prod, dev] = await Promise.all([
    checkUrlReachable(prodUrl),
    checkUrlReachable(devUrl),
  ]);
  if (prod.ok && dev.ok) return { ok: true };

  const issues: UrlReachabilityIssue[] = [];
  if (!prod.ok) issues.push({ side: "prod", url: prodUrl, kind: prod.kind, reason: prod.reason });
  if (!dev.ok) issues.push({ side: "dev", url: devUrl, kind: dev.kind, reason: dev.reason });

  // Legacy single-string error — still returned for any caller that just
  // wants to log it. The structured `issues` is the preferred surface.
  const error = issues
    .map((i) => `${i.side === "prod" ? "Prod" : "Dev"} URL (${i.url}) ${i.reason}`)
    .join(" · ");

  return { ok: false, error, issues };
}

/* ----- Presentation helpers (safe to import from client code) ----- */

const TITLE_BY_KIND: Record<UrlReachabilityKind, string> = {
  ssl: "HTTPS handshake error",
  refused: "Connection refused",
  dns: "Host not found",
  timeout: "Connection timeout",
  http_error: "Server error",
  other: "Connection error",
};

/**
 * Map a list of UrlReachabilityIssues into the textual fields the
 * ErrorModal expects (eyebrow, title, body). The hint sentence with the
 * "settings" link is JSX and is composed at the call site so we can route
 * to the right project's settings page.
 */
export function describeUrlIssues(issues: UrlReachabilityIssue[]): {
  eyebrow: string;
  title: string;
  body: string;
} {
  const first = issues[0];
  // If multiple sides failed, the title takes the first failure's kind.
  // Body lists each failure in turn so the user sees both.
  const sentences = issues.map(
    (i) => `${i.side === "prod" ? "Prod" : "Dev"} URL (${i.url}) ${i.reason}.`,
  );
  return {
    eyebrow: "Test was not able to run",
    title: TITLE_BY_KIND[first.kind] ?? TITLE_BY_KIND.other,
    body: `${sentences.join(" ")} The test was unable to be performed.`,
  };
}
