"use client";

import { useCallback, useEffect, useState } from "react";
import { getOhsee, isElectronRuntime } from "@/lib/electron";

type VaultEntryMeta = {
  key: string;
  label: string;
  createdAt: string;
  hasTotp: boolean;
};

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
              <div className="credential-row__actions">
                <button onClick={() => copySecret(entry.key)} className="flow-chip">
                  {flashed === `${entry.key}:secret` ? "Copied!" : "Copy secret"}
                </button>
                {entry.hasTotp && (
                  <button onClick={() => copyTotp(entry.key)} className="flow-chip flow-chip--warning">
                    {flashed === entry.key ? "Copied!" : "Copy TOTP"}
                  </button>
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

function CredentialEditor({
  existing,
  onClose,
  onSaved,
  onError,
}: {
  existing: VaultEntryMeta | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [key, setKey] = useState(existing?.key ?? "");
  const [label, setLabel] = useState(existing?.label ?? "");
  const [secret, setSecret] = useState("");
  const [totpSeed, setTotpSeed] = useState("");
  const [saving, setSaving] = useState(false);
  const isEditing = !!existing;

  async function save() {
    const ohsee = getOhsee();
    if (!ohsee) return;
    if (!key.trim()) return onError("Key is required");
    if (!secret) return onError("Secret is required");

    setSaving(true);
    try {
      await ohsee.vault.set(key.trim(), {
        label: label.trim() || key.trim(),
        secret,
        totpSeed: totpSeed.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div className="modal">
      <div className="modal__panel" style={{ width: 520, maxWidth: 520, padding: "var(--space-6)" }}>
        <h3 className="modal__title" style={{ fontSize: "var(--font-size-xl)", marginBottom: "var(--space-4)" }}>
          {isEditing ? "Edit credential" : "New credential"}
        </h3>

        <div className="field" style={{ marginBottom: "var(--space-3)" }}>
          <label className="field__label field__label--sm" style={{ fontWeight: "var(--weight-bold)" }}>Key (identifier)</label>
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={isEditing}
            placeholder="prod-admin"
            className="input input--compact input--code"
            style={{ background: "var(--surface-tertiary)" }}
            autoFocus
          />
        </div>

        <div className="field" style={{ marginBottom: "var(--space-3)" }}>
          <label className="field__label field__label--sm" style={{ fontWeight: "var(--weight-bold)" }}>Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Prod admin (admin@test.com)"
            className="input input--compact"
            style={{ background: "var(--surface-tertiary)" }}
          />
        </div>

        <div className="field" style={{ marginBottom: "var(--space-3)" }}>
          <label className="field__label field__label--sm" style={{ fontWeight: "var(--weight-bold)" }}>
            Secret {isEditing && <span style={{ fontWeight: "var(--weight-regular)", color: "var(--text-muted)" }}>(leave blank to keep existing)</span>}
          </label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Password, API key, etc."
            className="input input--compact input--code"
            style={{ background: "var(--surface-tertiary)" }}
          />
        </div>

        <div className="field" style={{ marginBottom: "var(--space-5)" }}>
          <label className="field__label field__label--sm" style={{ fontWeight: "var(--weight-bold)" }}>
            TOTP seed (optional)
          </label>
          <input
            type="password"
            value={totpSeed}
            onChange={(e) => setTotpSeed(e.target.value)}
            placeholder="Base32 seed or otpauth:// URI"
            className="input input--compact input--code"
            style={{ background: "var(--surface-tertiary)" }}
          />
          <p className="field__hint" style={{ fontSize: "var(--font-size-xs)" }}>
            For 2FA-protected accounts. Paste the base32 secret shown when you enrolled the authenticator.
          </p>
        </div>

        <div className="modal__actions modal__actions--sm">
          <button onClick={onClose} disabled={saving} className="btn btn--ghost">
            Cancel
          </button>
          <button onClick={save} disabled={saving} className="btn btn--primary-sm">
            {saving ? "Saving…" : isEditing ? "Save changes" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
