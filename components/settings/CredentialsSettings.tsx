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
      <div className="rounded-[8px] border border-border-primary bg-surface-tertiary p-[16px]">
        <p className="text-[14px] text-text-muted">
          The credentials vault is only available in the Electron app. Credentials are encrypted via the macOS Keychain and never leave your machine.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-[16px] text-[14px] text-text-muted animate-card-in">
        Stored locally and encrypted via the macOS Keychain. Used to inject usernames, passwords, and TOTP codes into Playwright flows when running audits against production accounts.
      </p>

      {error && (
        <div className="mb-[16px] rounded-[8px] border border-status-error/40 bg-status-error/10 p-[12px]">
          <p className="text-[13px] text-status-error">{error}</p>
        </div>
      )}

      {entries === null ? (
        <p className="text-[14px] text-text-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="mb-[16px] text-[14px] text-text-muted">No credentials stored yet.</p>
      ) : (
        <div className="mb-[16px] space-y-[8px]">
          {entries.map((entry) => (
            <div
              key={entry.key}
              className="flex items-center justify-between gap-[16px] rounded-[8px] border border-border-primary bg-surface-tertiary p-[12px]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-foreground">{entry.label}</p>
                <p className="truncate font-mono text-[12px] text-text-muted">{entry.key}</p>
              </div>
              <div className="flex shrink-0 items-center gap-[8px]">
                <button
                  onClick={() => copySecret(entry.key)}
                  className="rounded-[6px] px-[10px] py-[4px] text-[12px] text-text-muted transition-colors hover:bg-foreground/10 hover:text-foreground"
                >
                  {flashed === `${entry.key}:secret` ? "Copied!" : "Copy secret"}
                </button>
                {entry.hasTotp && (
                  <button
                    onClick={() => copyTotp(entry.key)}
                    className="rounded-[6px] bg-accent-yellow/20 px-[10px] py-[4px] text-[12px] font-bold text-foreground transition-colors hover:bg-accent-yellow/30"
                  >
                    {flashed === entry.key ? "Copied!" : "Copy TOTP"}
                  </button>
                )}
                <button
                  onClick={() => setEditing(entry)}
                  className="rounded-[6px] px-[10px] py-[4px] text-[12px] text-text-muted transition-colors hover:bg-foreground/10 hover:text-foreground"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteEntry(entry.key)}
                  className="rounded-[6px] px-[10px] py-[4px] text-[12px] text-status-error transition-colors hover:bg-status-error/10"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setCreating(true)}
        className="rounded-[8px] bg-foreground px-[16px] py-[8px] text-[13px] font-bold text-surface-content transition-all hover:-translate-y-[1px] hover:shadow-elevation-md"
      >
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[520px] rounded-[12px] border border-border-primary bg-surface-primary p-[24px]">
        <h3 className="mb-[16px] text-[18px] font-bold text-foreground">
          {isEditing ? "Edit credential" : "New credential"}
        </h3>

        <div className="mb-[12px]">
          <label className="mb-[4px] block text-[12px] font-bold text-text-muted">Key (identifier)</label>
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={isEditing}
            placeholder="prod-admin"
            className="w-full rounded-[8px] border border-border-primary bg-surface-tertiary px-[12px] py-[8px] font-mono text-[13px] text-foreground outline-none focus:border-foreground disabled:opacity-60"
            autoFocus
          />
        </div>

        <div className="mb-[12px]">
          <label className="mb-[4px] block text-[12px] font-bold text-text-muted">Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Prod admin (admin@test.com)"
            className="w-full rounded-[8px] border border-border-primary bg-surface-tertiary px-[12px] py-[8px] text-[13px] text-foreground outline-none focus:border-foreground"
          />
        </div>

        <div className="mb-[12px]">
          <label className="mb-[4px] block text-[12px] font-bold text-text-muted">
            Secret {isEditing && <span className="font-normal text-text-muted">(leave blank to keep existing)</span>}
          </label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Password, API key, etc."
            className="w-full rounded-[8px] border border-border-primary bg-surface-tertiary px-[12px] py-[8px] font-mono text-[13px] text-foreground outline-none focus:border-foreground"
          />
        </div>

        <div className="mb-[20px]">
          <label className="mb-[4px] block text-[12px] font-bold text-text-muted">
            TOTP seed (optional)
          </label>
          <input
            type="password"
            value={totpSeed}
            onChange={(e) => setTotpSeed(e.target.value)}
            placeholder="Base32 seed or otpauth:// URI"
            className="w-full rounded-[8px] border border-border-primary bg-surface-tertiary px-[12px] py-[8px] font-mono text-[13px] text-foreground outline-none focus:border-foreground"
          />
          <p className="mt-[4px] text-[11px] text-text-muted">
            For 2FA-protected accounts. Paste the base32 secret shown when you enrolled the authenticator.
          </p>
        </div>

        <div className="flex justify-end gap-[8px]">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-[8px] px-[16px] py-[8px] text-[13px] text-text-muted transition-colors hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-[8px] bg-foreground px-[16px] py-[8px] text-[13px] font-bold text-surface-content transition-all hover:-translate-y-[1px] hover:shadow-elevation-md disabled:opacity-50"
          >
            {saving ? "Saving…" : isEditing ? "Save changes" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
