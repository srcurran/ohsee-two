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

/** True when any microtest step uses $EMAIL$ / $PASSWORD$ / $OTP$. */
function hasTemplateVars(siteTest: SiteTest): boolean {
  return (
    siteTest.steps?.some(
      (s) =>
        s.type === "microtest" &&
        s.script &&
        /\$(EMAIL|PASSWORD|OTP)\$/.test(s.script),
    ) ?? false
  );
}

export async function resolveScriptCredentials(
  siteTest?: SiteTest | null,
): Promise<ScriptCredentials | undefined> {
  if (!siteTest) return undefined;

  const ohsee = getOhsee();
  if (!ohsee) return undefined;

  // The credential is whichever vault entry the user bound to the test.
  const vaultEntryId = siteTest.credentials?.vaultEntryId;

  if (!vaultEntryId) {
    if (hasTemplateVars(siteTest)) {
      console.warn(
        "resolveScriptCredentials: test has scripts with $EMAIL$/$PASSWORD$/$OTP$ " +
        "but no credential is selected. Pick one in test settings.",
      );
    }
    return undefined;
  }

  try {
    const entry = await ohsee.vault.get(vaultEntryId);
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
