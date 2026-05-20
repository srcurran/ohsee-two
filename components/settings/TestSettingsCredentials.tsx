/** Credentials section inside the test-settings overlay — toggle for
 * minting an auth session before capture and an inline vault editor so
 * the user doesn't have to bounce to Settings → Credentials to add a new
 * keychain entry. */

"use client";

import { useCallback, useEffect, useState } from "react";
import type { TestCredentials } from "@/lib/types";
import { getOhsee, isElectronRuntime } from "@/lib/electron";
import {
  CredentialEditor,
  type VaultEntryMeta,
} from "@/components/settings/CredentialEditor";

interface CredentialsSectionProps {
  credentials: TestCredentials | undefined;
  onChange: (next: TestCredentials | undefined) => void;
  /** True when any script step contains $EMAIL$, $PASSWORD$, or $OTP$ */
  hasTemplateVars?: boolean;
}

export function CredentialsSection({
  credentials,
  onChange,
  hasTemplateVars,
}: CredentialsSectionProps) {
  const enabled = credentials?.enabled === true;

  // Vault state — mirrors the new-test wizard so users can manage
  // credentials inline without losing context.
  const [vaultEntries, setVaultEntries] = useState<VaultEntryMeta[] | null>(
    null,
  );
  const [editingEntry, setEditingEntry] = useState<VaultEntryMeta | null>(null);
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
    if (isElectronRuntime()) refreshVault();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              {vaultEntries.map((entry) => {
                const selected = credentials?.vaultEntryId === entry.key;
                return (
                  <li
                    key={entry.key}
                    onClick={() =>
                      onChange({
                        ...credentials,
                        vaultEntryId: selected ? undefined : entry.key,
                      })
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-2)",
                      padding: "var(--space-1-5) var(--space-2)",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      background: selected ? "var(--tint-4)" : "transparent",
                    }}
                  >
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        border: `2px solid ${selected ? "var(--brand-500)" : "var(--neutral-dark-300)"}`,
                        background: selected ? "var(--brand-500)" : "transparent",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {selected && (
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "white" }} />
                      )}
                    </span>
                    <span style={{ flex: 1, fontSize: "var(--font-size-md)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.label}</span>
                    <code
                      style={{
                        fontSize: "var(--font-size-sm)",
                        color: "var(--neutral-dark-500)",
                        flexShrink: 0,
                      }}
                    >
                      {entry.key}
                      {entry.hasTotp ? " · 2FA" : ""}
                    </code>
                    <button
                      type="button"
                      className="btn btn--text"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingEntry(entry);
                        setCredEditorOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn--text"
                      style={{ color: "var(--status-error-500)" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const ohsee = getOhsee();
                        if (!ohsee) return;
                        ohsee.vault.delete(entry.key).then(() => {
                          if (credentials?.vaultEntryId === entry.key) {
                            onChange({ ...credentials, vaultEntryId: undefined });
                          }
                          refreshVault();
                        }).catch((err: unknown) => {
                          setVaultError(err instanceof Error ? err.message : String(err));
                        });
                      }}
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {credentials?.vaultEntryId && (
            <p className="credentials-section__hint">
              Selected credential will be used for <code>$EMAIL$</code>, <code>$PASSWORD$</code>, <code>$OTP$</code> in scripts.
            </p>
          )}

          {hasTemplateVars && !credentials?.vaultEntryId && (
            <p
              className="credentials-section__hint"
              style={{ color: "var(--status-warning-500)" }}
            >
              Your scripts use <code>$EMAIL$</code>, <code>$PASSWORD$</code>, or <code>$OTP$</code> but no vault credential is selected — click one above to bind it.
            </p>
          )}

          <div>
            <button
              type="button"
              onClick={() => {
                setEditingEntry(null);
                setCredEditorOpen(true);
              }}
              className="btn btn--ghost"
            >
              + Add credential
            </button>
          </div>
        </div>
      )}

      {credEditorOpen && (
        <CredentialEditor
          existing={editingEntry}
          onClose={() => {
            setCredEditorOpen(false);
            setEditingEntry(null);
          }}
          onSaved={() => {
            setCredEditorOpen(false);
            setEditingEntry(null);
            refreshVault();
          }}
          onError={setVaultError}
        />
      )}
    </div>
  );
}
