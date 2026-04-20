/**
 * Shared URL / path normalization helpers.
 *
 * The main export, `resolveProjectPath`, turns user-typed input (paths, bare
 * domains, full URLs with or without `www`) into a clean path relative to the
 * project's domain(s). Used by the Pages input on the test settings page and
 * the navigate step in `components/FlowEditor.tsx`.
 *
 * Domain equivalence: `www.foo.com` is treated as `foo.com`. A project with
 * `prodUrl=https://foyersavings.com` and `devUrl=https://dev.foyersavings.com`
 * accepts paths pasted from either host — and from `www.foyersavings.com` —
 * but rejects `google.com` with an error.
 */

/** Prepend `https://` if the input doesn't start with a protocol. */
export function ensureProtocol(url: string): string {
  if (!/^https?:\/\//i.test(url)) return `https://${url}`;
  return url;
}

/** Strip leading `www.` from a hostname so `www.foo.com` compares equal to `foo.com`. */
export function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

/**
 * Hostname-only extraction without the `www.` prefix. Returns the raw input
 * on parse failure so callers can still display something.
 */
export function getDomain(url: string): string {
  try {
    return normalizeHostname(new URL(ensureProtocol(url)).hostname);
  } catch {
    return url;
  }
}

/**
 * Try to parse `input` as a URL. Accepts bare domains like `foo.com/bar` by
 * prepending `https://` when no protocol is present. Returns null if the input
 * can't be coerced into a URL (e.g. it's a bare path like `/about`).
 */
export function tryParseUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Paths are not URLs — don't try to parse them.
  if (trimmed.startsWith("/")) return null;
  try {
    return new URL(ensureProtocol(trimmed));
  } catch {
    return null;
  }
}

export type ResolvedPath =
  | { ok: true; path: string }
  | { ok: false; error: string };

/**
 * Resolve user input to a path that belongs to one of the allowed project
 * domains. See module-level JSDoc for examples.
 *
 * @param input             User input — `/about`, `foo.com`, full URL, etc.
 * @param allowedDomainUrls The project's `prodUrl` and `devUrl` (full URLs).
 *                          Hostnames are extracted and `www.` is ignored for
 *                          comparison.
 */
export function resolveProjectPath(
  input: string,
  allowedDomainUrls: string[],
): ResolvedPath {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "Path is required." };
  }

  const allowed = allowedDomainUrls
    .map((u) => {
      try {
        return normalizeHostname(new URL(ensureProtocol(u)).hostname);
      } catch {
        return null;
      }
    })
    .filter((h): h is string => !!h);

  const parsed = tryParseUrl(trimmed);

  if (parsed) {
    const inputHost = normalizeHostname(parsed.hostname);
    if (allowed.length > 0 && !allowed.includes(inputHost)) {
      return {
        ok: false,
        error: `URL is from a different domain (${inputHost}). Expected ${allowed.join(" or ")}.`,
      };
    }
    const path = (parsed.pathname || "/") + parsed.search + parsed.hash;
    return { ok: true, path: path.startsWith("/") ? path : `/${path}` };
  }

  // Bare path or path-ish input. Add a leading `/` if missing.
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return { ok: true, path };
}
