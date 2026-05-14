/** Credentials section inside the test-settings overlay — toggle for
 * minting an auth session before capture, an option to copy credentials
 * from a sibling test, and an inline vault editor so the user doesn't
 * have to bounce to Settings → Credentials to add a new keychain entry. */

"use client";

import { useCallback, useEffect, useState } from "react";
import type { SiteTest, TestCredentials } from "@/lib/types";
import { getOhsee, isElectronRuntime } from "@/lib/electron";
import {
  CredentialEditor,
  type VaultEntryMeta,
} from "@/components/settings/CredentialEditor";

interface CredentialsSectionProps {
  credentials: TestCredentials | undefined;
  otherTests: SiteTest[];
  onChange: (next: TestCredentials | undefined) => void;
}

export function CredentialsSection({
  credentials,
  otherTests,
  onChange,
}: CredentialsSectionProps) {
  const enabled = credentials?.enabled === true;
  const copyFromId = credentials?.copyFromTestId ?? "";

  // Vault state — mirrors the new-test wizard so users can manage
  // credentials inline without losing context.
  const [vaultEntries, setVaultEntries] = useState<VaultEntryMeta[] | null>(
    null,
  );
  const [credEditorOpen, setCredEditorOpen] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);

  const refreshVault = useCallback(async () => {
    const ohsee = getOhsee();
    if (!ohsee) return;
    try {
      setVaultEntries(await ohsee.vault.list());
      setVaultError(null);
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    if (vaultEntries === null && isElectronRuntime()) refreshVault();
  }, [vaultEntries, refreshVault]);

  return (
    <div className="credentials-section">
      <label className="credentials-section__row">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) =>
            onChange({ ...credentials, enabled: e.target.checked })
          }
          className="checkbox"
        />
        <span>Mint a session cookie before each capture (require auth)</span>
      </label>

      <div className="credentials-section__row">
        <label className="credentials-section__label">Copy from other settings…</label>
        <select
          className="input input--compact"
          value={copyFromId}
          onChange={(e) =>
            onChange({
              ...credentials,
              copyFromTestId: e.target.value || undefined,
            })
          }
          disabled={otherTests.length === 0}
        >
          <option value="">Don&apos;t copy</option>
          {otherTests.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {!enabled && !copyFromId && (
        <p className="credentials-section__hint">
          No credentials configured — runs use the project default.
        </p>
      )}

      {isElectronRuntime() && (
        <div
          className="credentials-section__row"
          style={{
            flexDirection: "column",
            alignItems: "stretch",
            gap: "var(--space-2)",
          }}
        >
          <label className="credentials-section__label">Vault credentials</label>

          {vaultError && (
            <p
              className="credentials-section__hint"
              style={{ color: "var(--status-error-500)" }}
            >
              {vaultError}
            </p>
          )}

          {vaultEntries === null ? (
            <p className="credentials-section__hint">Loading…</p>
          ) : vaultEntries.length === 0 ? (
            <p className="credentials-section__hint">
              No credentials stored yet — add one below to reference in your flow.
            </p>
          ) : (
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-1)",
              }}
            >
              {vaultEntries.map((entry) => (
                <li
                  key={entry.key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    padding: "var(--space-1) 0",
                  }}
                >
                  <span style={{ fontSize: "var(--font-size-md)" }}>{entry.label}</span>
                  <code
                    style={{
                      fontSize: "var(--font-size-sm)",
                      color: "var(--neutral-dark-500)",
                    }}
                  >
                    {entry.key}
                    {entry.hasTotp ? " · 2FA" : ""}
                  </code>
                </li>
              ))}
            </ul>
          )}

          <div>
            <button
              type="button"
              onClick={() => setCredEditorOpen(true)}
              className="btn btn--ghost"
            >
              + Add credential
            </button>
          </div>
        </div>
      )}

      {credEditorOpen && (
        <CredentialEditor
          existing={null}
          onClose={() => setCredEditorOpen(false)}
          onSaved={() => {
            setCredEditorOpen(false);
            refreshVault();
          }}
          onError={setVaultError}
        />
      )}
    </div>
  );
}
