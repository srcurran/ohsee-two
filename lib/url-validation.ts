/**
 * Sync URL validation used by the settings UI to surface input typos at
 * the moment the user pauses typing — well before they hit Run and the
 * preflight catches it.
 *
 * Mirrors the runtime in report-runner.ts, which auto-prepends `http://`
 * when no protocol is given. We do the same here so the UI doesn't flag
 * URLs that the runner happily accepts (e.g. `app-dev.foyersavings.com`,
 * `localhost:3000`).
 */

export type UrlCheck =
  | { ok: true }
  | { ok: false; reason: string };

const HAS_PROTOCOL = /^https?:\/\//i;
// Catches partial / mistyped protocols ("http", "https:", "htps://") so
// we still surface a typo instead of silently appending another http://.
const LOOKS_LIKE_PARTIAL_PROTOCOL = /^[a-z]+:?\/?\/?$|^h[a-z]*$/i;

export function checkUrl(value: string): UrlCheck {
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, reason: "Required" };

  if (LOOKS_LIKE_PARTIAL_PROTOCOL.test(trimmed)) {
    return { ok: false, reason: "Not a valid URL" };
  }

  const candidate = HAS_PROTOCOL.test(trimmed) ? trimmed : `http://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, reason: "Not a valid URL" };
  }

  if (!parsed.hostname) {
    return { ok: false, reason: "Missing hostname" };
  }

  return { ok: true };
}
