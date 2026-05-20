/**
 * Client-side helper that resolves vault credentials for a test before
 * starting a run. Returns a `ScriptCredentials` payload that the API
 * route forwards to the runner for $EMAIL$ / $PASSWORD$ / $OTP$
 * interpolation in Playwright script steps.
 *
 * Only called from the renderer (React client) where `window.ohsee` is
 * available. Returns `undefined` when the test has no vault entry
 * configured or we're outside Electron.
 *
 * Fallback: when no `vaultEntryId` is explicitly selected but
 * `credentials.enabled` is true AND scripts contain template variables,
 * the first vault entry is used automatically so the user doesn't have
 * to manually select one.
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

  // Determine which vault entry to use:
  // 1. Explicit selection via vaultEntryId (user clicked a vault entry)
  // 2. Fallback: when credentials.enabled is true and scripts use
  //    template vars, pick the first vault entry automatically.
  let vaultEntryId = siteTest.credentials?.vaultEntryId;

  if (!vaultEntryId && siteTest.credentials?.enabled && hasTemplateVars(siteTest)) {
    try {
      const entries = await ohsee.vault.list();
      if (entries.length > 0) {
        vaultEntryId = entries[0].key;
        console.info(
          `resolveScriptCredentials: no vaultEntryId set, auto-selecting ` +
          `first vault entry "${entries[0].label}" (${entries[0].key})`,
        );
      } else {
        console.warn(
          "resolveScriptCredentials: scripts use $EMAIL$/$PASSWORD$/$OTP$ " +
          "but the vault is empty. Add a credential in test settings.",
        );
        return undefined;
      }
    } catch (err) {
      console.error("Failed to list vault entries for fallback:", err);
      return undefined;
    }
  }

  if (!vaultEntryId) {
    if (hasTemplateVars(siteTest)) {
      console.warn(
        "resolveScriptCredentials: test has scripts with $EMAIL$/$PASSWORD$/$OTP$ " +
        "but no vaultEntryId is set and credentials are not enabled. " +
        "Enable credentials and/or select a vault entry in test settings.",
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
