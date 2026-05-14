"use client";

import { useState } from "react";
import { getOhsee } from "@/lib/electron";

export type VaultEntryMeta = {
  key: string;
  label: string;
  createdAt: string;
  hasTotp: boolean;
};

interface CredentialEditorProps {
  /** Pass an existing entry to edit it, or null to create a new one. */
  existing: VaultEntryMeta | null;
  onClose: () => void;
  onSaved: (key: string) => void;
  onError: (message: string) => void;
}

/** Modal editor for a single vault credential entry. Extracted from
 * CredentialsSettings so the new-test wizard can reuse it inline. */
export function CredentialEditor({
  existing,
  onClose,
  onSaved,
  onError,
}: CredentialEditorProps) {
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
      onSaved(key.trim());
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
            style={{ background: "var(--neutral-light-200)" }}
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
            style={{ background: "var(--neutral-light-200)" }}
          />
        </div>

        <div className="field" style={{ marginBottom: "var(--space-3)" }}>
          <label className="field__label field__label--sm" style={{ fontWeight: "var(--weight-bold)" }}>
            Secret {isEditing && <span style={{ fontWeight: "var(--weight-regular)", color: "var(--neutral-dark-500)" }}>(leave blank to keep existing)</span>}
          </label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Password, API key, etc."
            className="input input--compact input--code"
            style={{ background: "var(--neutral-light-200)" }}
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
            style={{ background: "var(--neutral-light-200)" }}
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
