"use client";

import { useCallback, useEffect, useState } from "react";
import { getOhsee, isElectronRuntime } from "@/lib/electron";
import { CredentialEditor, type VaultEntryMeta } from "@/components/settings/CredentialEditor";

export default function CredentialsSettings() {
  const [mounted, setMounted] = useState(false);
  const [entries, setEntries] = useState<VaultEntryMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<VaultEntryMeta | null>(null);
  const [creating, setCreating] = useState(false);
  const [flashed, setFlashed] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const ohsee = getOhsee();
    if (!ohsee) return;
    try {
      const list = await ohsee.vault.list();
      setEntries(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    refresh();
  }, [mounted, refresh]);

  const copyTotp = useCallback(async (key: string) => {
    const ohsee = getOhsee();
    if (!ohsee) return;
    try {
      const code = await ohsee.vault.totp(key);
      await navigator.clipboard.writeText(code);
      setFlashed(key);
      setTimeout(() => setFlashed(null), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const copySecret = useCallback(async (key: string) => {
    const ohsee = getOhsee();
    if (!ohsee) return;
    try {
      const entry = await ohsee.vault.get(key);
      await navigator.clipboard.writeText(entry.secret);
      setFlashed(`${key}:secret`);
      setTimeout(() => setFlashed(null), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const deleteEntry = useCallback(async (key: string) => {
    const ohsee = getOhsee();
    if (!ohsee) return;
    if (!confirm(`Delete credential "${key}"? This cannot be undone.`)) return;
    try {
      await ohsee.vault.delete(key);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [refresh]);

  if (!mounted) return null;
  if (!isElectronRuntime()) {
    return (
      <div className="info-box">
        <p className="section-body" style={{ margin: 0 }}>
          The credentials vault is only available in the Electron app. Credentials are encrypted via the macOS Keychain and never leave your machine.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="section-body animate-card-in">
        Stored locally and encrypted via the macOS Keychain. Used to inject usernames, passwords, and TOTP codes into Playwright flows when running audits against production accounts.
      </p>

      {error && (
        <div className="test-result test-result--fail" style={{ marginBottom: "var(--space-4)" }}>
          <p className="test-result__error" style={{ margin: 0, whiteSpace: "normal", fontFamily: "inherit" }}>{error}</p>
        </div>
      )}

      {entries === null ? (
        <p className="loader-text">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="section-body">No credentials stored yet.</p>
      ) : (
        <div className="stack stack--sm" style={{ marginBottom: "var(--space-4)" }}>
          {entries.map((entry) => (
            <div key={entry.key} className="credential-row">
              <div className="credential-row__info">
                <p className="credential-row__label">{entry.label}</p>
                <p className="credential-row__key">{entry.key}</p>
              </div>
              <div className="row row--sm shrink-0">
                <button onClick={() => copySecret(entry.key)} className="flow-chip">
                  {flashed === `${entry.key}:secret` ? "Copied!" : "Copy secret"}
                </button>
                {entry.hasTotp && (
                  <button onClick={() => copyTotp(entry.key)} className="flow-chip flow-chip--warning">
                    {flashed === entry.key ? "Copied!" : "Copy TOTP"}
                  </button>
                )}
                {entry.manualOtp && (
                  <span className="flow-chip" style={{ cursor: "default", opacity: 0.7 }}>
                    Manual OTP
                  </span>
                )}
                <button onClick={() => setEditing(entry)} className="flow-chip">
                  Edit
                </button>
                <button onClick={() => deleteEntry(entry.key)} className="flow-chip flow-chip--danger">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => setCreating(true)} className="btn btn--primary-sm">
        + Add credential
      </button>

      {(creating || editing) && (
        <CredentialEditor
          existing={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            refresh();
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

