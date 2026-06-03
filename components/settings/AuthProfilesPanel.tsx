"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ScriptEditor from "@/components/settings/ScriptEditor";
import { CredentialEditor, type VaultEntryMeta } from "@/components/settings/CredentialEditor";
import { getOhsee, isElectronRuntime } from "@/lib/electron";
import { resolveVaultCredentials } from "@/lib/vault-resolve";
import { formatRelativeTimeShort } from "@/lib/relative-time";
import type { AuthProfile, Project } from "@/lib/types";

const CREATE_SENTINEL = "__create__";

/**
 * Site-level auth profiles manager — embedded as a same-panel sub-view (with
 * a back button supplied by the host) rather than a stacked overlay. Each
 * profile bundles a login script with the storage tokens it produces (cached
 * server-side via "Generate session"). Persistence merges onto the stored
 * profile so it never clobbers server-captured tokens.
 */
export default function AuthProfilesPanel({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [profiles, setProfiles] = useState<AuthProfile[]>([]);
  const [vaultEntries, setVaultEntries] = useState<VaultEntryMeta[] | null>(null);
  const [credEditorFor, setCredEditorFor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((p: Project) => {
        setProject(p);
        setProfiles(p.authProfiles ?? []);
      });
  }, [projectId]);

  const refreshVault = useCallback(async () => {
    const o = getOhsee();
    if (!o) return;
    try {
      setVaultEntries(await o.vault.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);
  useEffect(() => {
    if (isElectronRuntime()) refreshVault();
  }, [refreshVault]);

  /** Persist editable fields, merging onto stored profiles so server-captured
   *  storageState / tokensUpdatedAt survive. */
  const persist = useCallback(
    async (next: AuthProfile[]) => {
      const latest: Project = await fetch(`/api/projects/${projectId}`).then((r) => r.json());
      const stored = new Map((latest.authProfiles ?? []).map((p) => [p.id, p]));
      const merged = next.map((p) => {
        const s = stored.get(p.id);
        return s
          ? { ...s, name: p.name, vaultEntryId: p.vaultEntryId, loginScript: p.loginScript }
          : p;
      });
      await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authProfiles: merged }),
      });
    },
    [projectId],
  );

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSave = (next: AuthProfile[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(next), 600);
  };
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const update = (id: string, patch: Partial<AuthProfile>, immediate = false) => {
    setProfiles((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...patch } : p));
      if (immediate) persist(next);
      else scheduleSave(next);
      return next;
    });
  };
  const addProfile = () => {
    const next: AuthProfile[] = [
      ...profiles,
      { id: crypto.randomUUID(), name: `Profile ${profiles.length + 1}`, loginScript: "" },
    ];
    setProfiles(next);
    persist(next);
  };
  const removeProfile = (id: string) => {
    const next = profiles.filter((p) => p.id !== id);
    setProfiles(next);
    persist(next);
  };

  const generate = async (profile: AuthProfile) => {
    setBusyId(profile.id);
    setError(null);
    try {
      const creds = await resolveVaultCredentials(profile.vaultEntryId);
      const res = await fetch(
        `/api/projects/${projectId}/auth-profiles/${profile.id}/session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scriptCredentials: creds }),
        },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setError(e.error || "Failed to generate session");
        return;
      }
      const { tokensUpdatedAt } = await res.json();
      // Display-only: the server already saved storageState + tokensUpdatedAt.
      setProfiles((prev) =>
        prev.map((p) => (p.id === profile.id ? { ...p, tokensUpdatedAt } : p)),
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="auth-profiles">
      <div className="auth-profiles__body">
        <p className="auth-profiles__hint">
          Record a login once; its session tokens are reused so tests start
          already signed in. Different profiles let you compare the site as
          different identities (e.g. new vs existing customer).
        </p>

        {error && (
          <p className="credentials-section__hint credentials-section__hint--error">{error}</p>
        )}

        {profiles.length === 0 ? (
          <p className="auth-profiles__empty">No sign-in profiles yet.</p>
        ) : (
          profiles.map((profile) => (
            <div key={profile.id} className="auth-profile">
              <div className="auth-profile__head">
                <input
                  className="auth-profile__name"
                  value={profile.name}
                  onChange={(e) => update(profile.id, { name: e.target.value })}
                  placeholder="Profile name"
                />
                <button
                  type="button"
                  className="btn btn--text auth-profile__remove"
                  onClick={() => removeProfile(profile.id)}
                >
                  Remove
                </button>
              </div>

              {isElectronRuntime() && (
                <div className="credentials-section__vault">
                  <label className="credentials-section__label">Credential</label>
                  <select
                    className="credentials-section__select"
                    value={profile.vaultEntryId ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === CREATE_SENTINEL) { setCredEditorFor(profile.id); return; }
                      update(profile.id, { vaultEntryId: v || undefined }, true);
                    }}
                  >
                    <option value="">No credential</option>
                    {vaultEntries?.map((entry) => (
                      <option key={entry.key} value={entry.key}>
                        {entry.label}{entry.hasTotp ? " · 2FA" : ""}
                      </option>
                    ))}
                    <option value={CREATE_SENTINEL}>+ Create new credential…</option>
                  </select>
                </div>
              )}

              <ScriptEditor
                value={profile.loginScript}
                onChange={(s) => update(profile.id, { loginScript: s })}
                defaultUrl={project?.prodUrl}
              />

              <div className="auth-profile__session">
                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  onClick={() => generate(profile)}
                  disabled={busyId === profile.id || !profile.loginScript.trim()}
                >
                  {busyId === profile.id ? "Generating…" : "Generate session"}
                </button>
                <span className="auth-profile__tokens">
                  {profile.tokensUpdatedAt
                    ? `Session captured ${formatRelativeTimeShort(profile.tokensUpdatedAt)} ago`
                    : "No session yet"}
                </span>
              </div>
            </div>
          ))
        )}

        <button type="button" className="btn btn--outline auth-profiles__add" onClick={addProfile}>
          + Add sign-in profile
        </button>
      </div>

      {credEditorFor && (
        <CredentialEditor
          existing={null}
          onClose={() => setCredEditorFor(null)}
          onSaved={(key) => {
            const id = credEditorFor;
            setCredEditorFor(null);
            refreshVault();
            if (id) update(id, { vaultEntryId: key }, true);
          }}
          onError={setError}
        />
      )}
    </div>
  );
}
