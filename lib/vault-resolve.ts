/**
 * Client-side helper that resolves vault credentials for a test before
 * starting a run. Returns a `ScriptCredentials` payload that the API
 * route forwards to the runner for $EMAIL$ / $PASSWORD$ / $OTP$
 * interpolation in Playwright script steps.
 *
 * Only called from the renderer (React client) where `window.ohsee` is
 * available. Returns `undefined` when the test has no vault entry
 * configured or we're outside Electron.
 */

import { getOhsee } from "./electron";
import type { ScriptCredentials, SiteTest } from "./types";

export type { ScriptCredentials };

export async function resolveScriptCredentials(
  siteTest?: SiteTest | null,
): Promise<ScriptCredentials | undefined> {
  if (!siteTest?.credentials?.vaultEntryId) return undefined;

  const ohsee = getOhsee();
  if (!ohsee) return undefined;

  try {
    const entry = await ohsee.vault.get(siteTest.credentials.vaultEntryId);
    return {
      email: entry.label,
      password: entry.secret,
      totpSeed: entry.totpSeed,
      staticOtp: entry.staticOtp,
    };
  } catch (err) {
    console.error("Failed to resolve vault credentials:", err);
    return undefined;
  }
}
