/**
 * Sync URL validation used by the settings UI to surface input typos at
 * the moment the user pauses typing — well before they hit Run and the
 * preflight catches it. Intentionally permissive: anything `URL` parses
 * with an http(s) protocol and a non-empty hostname counts as valid.
 */

export type UrlCheck =
  | { ok: true }
  | { ok: false; reason: string };

const HAS_PROTOCOL = /^https?:\/\//i;

export function checkUrl(value: string): UrlCheck {
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, reason: "Required" };

  if (!HAS_PROTOCOL.test(trimmed)) {
    return { ok: false, reason: "Missing http:// or https://" };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: "Not a valid URL" };
  }

  if (!parsed.hostname) {
    return { ok: false, reason: "Missing hostname" };
  }

  return { ok: true };
}
