/** Credentials section inside the test-settings overlay and the new-test
 * wizard — a toggle for signing in before capture and a dropdown for picking
 * (or creating) the vault credential used for auth + $EMAIL$/$PASSWORD$/$OTP$
 * script interpolation. */

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

/** Sentinel <option> value that opens the create-credential editor. */
const CREATE_SENTINEL = "__create__";

export function CredentialsSection({
  credentials,
  onChange,
  hasTemplateVars,
}: CredentialsSectionProps) {
  const enabled = credentials?.enabled === true;

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

  const selectedKey = credentials?.vaultEntryId ?? "";
  const selectedEntry =
    vaultEntries?.find((e) => e.key === selectedKey) ?? null;

  const handleSelect = (value: string) => {
    if (value === CREATE_SENTINEL) {
      setEditingEntry(null);
      setCredEditorOpen(true);
      return;
    }
    onChange({ ...credentials, vaultEntryId: value || undefined });
  };

  const removeSelected = () => {
    const ohsee = getOhsee();
    if (!ohsee || !selectedEntry) return;
    ohsee.vault
      .delete(selectedEntry.key)
      .then(() => {
        onChange({ ...credentials, vaultEntryId: undefined });
        refreshVault();
      })
      .catch((err: unknown) => {
        setVaultError(err instanceof Error ? err.message : String(err));
      });
  };

  return (
    <div className="credentials-section">
      <label className="credentials-section__row">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            const next = { ...credentials, enabled: e.target.checked };
            // Auto-select first vault entry when enabling if none is
            // selected — saves the user an extra step.
            if (
              e.target.checked &&
              !credentials?.vaultEntryId &&
              vaultEntries &&
              vaultEntries.length > 0
            ) {
              next.vaultEntryId = vaultEntries[0].key;
            }
            onChange(next);
          }}
          className="checkbox"
        />
        <span>Sign in before capturing (for pages behind a login)</span>
      </label>

      {isElectronRuntime() && (
        <div className="credentials-section__vault">
          <label
            className="credentials-section__label"
            htmlFor="credentials-select"
          >
            Credential
          </label>
          <div className="credentials-section__vault-row">
            <select
              id="credentials-select"
              className="credentials-section__select"
              value={selectedKey}
              onChange={(e) => handleSelect(e.target.value)}
            >
              <option value="">No credential</option>
              {vaultEntries?.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                  {entry.hasTotp ? " · 2FA" : ""}
                </option>
              ))}
              <option value={CREATE_SENTINEL}>+ Create new credential…</option>
            </select>
            {selectedEntry && (
              <>
                <button
                  type="button"
                  className="btn btn--text"
                  onClick={() => {
                    setEditingEntry(selectedEntry);
                    setCredEditorOpen(true);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn--text credentials-section__remove"
                  onClick={removeSelected}
                >
                  Remove
                </button>
              </>
            )}
          </div>

          {vaultError && (
            <p className="credentials-section__hint credentials-section__hint--error">
              {vaultError}
            </p>
          )}

          {selectedKey ? (
            <p className="credentials-section__hint">
              Used for <code>$EMAIL$</code>, <code>$PASSWORD$</code>,{" "}
              <code>$OTP$</code> in scripts.
            </p>
          ) : (
            hasTemplateVars && (
              <p className="credentials-section__hint credentials-section__hint--warning">
                Your scripts use <code>$EMAIL$</code>, <code>$PASSWORD$</code>,
                or <code>$OTP$</code> — select a credential to bind it.
              </p>
            )
          )}
        </div>
      )}

      {credEditorOpen && (
        <CredentialEditor
          existing={editingEntry}
          onClose={() => {
            setCredEditorOpen(false);
            setEditingEntry(null);
          }}
          onSaved={(key) => {
            const wasCreating = !editingEntry;
            setCredEditorOpen(false);
            setEditingEntry(null);
            refreshVault();
            // Auto-bind a freshly created credential.
            if (wasCreating) onChange({ ...credentials, vaultEntryId: key });
          }}
          onError={setVaultError}
        />
      )}
    </div>
  );
}
