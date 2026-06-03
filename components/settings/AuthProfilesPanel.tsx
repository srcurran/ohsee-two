"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ScriptEditor from "@/components/settings/ScriptEditor";
import { getOhsee, isElectronRuntime } from "@/lib/electron";
import { resolveVaultCredentials } from "@/lib/vault-resolve";
import { formatRelativeTime } from "@/lib/relative-time";
import type { AuthProfile, Project } from "@/lib/types";

/** Inline credential fields, mirrored from the profile's Keychain entry. */
interface Cred {
  email: string;
  password: string;
  totpSeed: string;
}
const EMPTY_CRED: Cred = { email: "", password: "", totpSeed: "" };

/**
 * Site-level sign-in profiles manager — embedded as a same-panel sub-view.
 * Each profile owns its credential 1:1: the Email / Password / 2FA fields are
 * edited inline and written to a per-profile Keychain entry (only the vault
 * *key* lands in projects.json — never the secret). The sign-in script reads
 * those values via $EMAIL$ / $PASSWORD$ / $OTP$. Running the script once
 * (Test sign in) captures the storage state the runner reuses.
 */
export default function AuthProfilesPanel({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [profiles, setProfiles] = useState<AuthProfile[]>([]);
  const [credsById, setCredsById] = useState<Record<string, Cred>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load the project + profiles, then each profile's credential from the vault.
  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then(async (p: Project) => {
        setProject(p);
        const list = p.authProfiles ?? [];
        setProfiles(list);
        const o = getOhsee();
        if (!o || !isElectronRuntime()) return;
        const next: Record<string, Cred> = {};
        await Promise.all(
          list.map(async (pr) => {
            if (!pr.vaultEntryId) return;
            try {
              const e = await o.vault.get(pr.vaultEntryId);
              next[pr.id] = {
                email: e.label ?? "",
                password: e.secret ?? "",
                totpSeed: e.totpSeed ?? "",
              };
            } catch {
              // entry may have been removed out-of-band — leave blank
            }
          }),
        );
        setCredsById(next);
      });
  }, [projectId]);

  /** Persist profile fields, merging onto stored profiles so server-captured
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
  const credTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      Object.values(credTimers.current).forEach(clearTimeout);
    },
    [],
  );

  const update = (id: string, patch: Partial<AuthProfile>, immediate = false) => {
    setProfiles((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...patch } : p));
      if (immediate) {
        persist(next);
      } else {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => persist(next), 600);
      }
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
    const profile = profiles.find((p) => p.id === id);
    const next = profiles.filter((p) => p.id !== id);
    setProfiles(next);
    persist(next);
    // Best-effort: drop the profile's Keychain entry too.
    const o = getOhsee();
    if (o && profile?.vaultEntryId) o.vault.delete(profile.vaultEntryId).catch(() => {});
  };

  /** Edit a credential field → debounced write to the profile's Keychain entry. */
  const updateCred = (profileId: string, patch: Partial<Cred>) => {
    setCredsById((prev) => {
      const merged = {
        ...prev,
        [profileId]: { ...(prev[profileId] ?? EMPTY_CRED), ...patch },
      };
      clearTimeout(credTimers.current[profileId]);
      credTimers.current[profileId] = setTimeout(
        () => writeCred(profileId, merged[profileId]),
        600,
      );
      return merged;
    });
  };

  const writeCred = async (profileId: string, c: Cred) => {
    // Wait until there's a password to store, so we don't create empty entries.
    if (!c.password) return;
    const o = getOhsee();
    if (!o) return;
    const profile = profiles.find((p) => p.id === profileId);
    const key = profile?.vaultEntryId || `signin-${profileId}`;
    try {
      await o.vault.set(key, {
        label: c.email,
        secret: c.password,
        totpSeed: c.totpSeed.trim() || undefined,
      });
      if (!profile?.vaultEntryId) update(profileId, { vaultEntryId: key }, true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
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
        setError(e.error || "Sign-in test failed");
        return;
      }
      const { tokensUpdatedAt } = await res.json();
      setProfiles((prev) =>
        prev.map((p) => (p.id === profile.id ? { ...p, tokensUpdatedAt } : p)),
      );
    } finally {
      setBusyId(null);
    }
  };

  const electron = isElectronRuntime();

  return (
    <div className="auth-profiles">
      <div className="auth-profiles__body">
        <p className="auth-profiles__hint">
          Record a sign-in once and reuse it, so tests start already signed in.
          Different profiles let you compare the site as different identities
          (e.g. new vs existing customer).
        </p>

        {error && (
          <p className="credentials-section__hint credentials-section__hint--error">{error}</p>
        )}

        {profiles.length === 0 ? (
          <p className="auth-profiles__empty">No sign-in profiles yet.</p>
        ) : (
          profiles.map((profile) => {
            const cred = credsById[profile.id] ?? EMPTY_CRED;
            return (
              <div key={profile.id} className="auth-profile">
                <div className="auth-profile__field">
                  <label className="credentials-section__label">Title</label>
                  <input
                    className="auth-profile__name"
                    value={profile.name}
                    onChange={(e) => update(profile.id, { name: e.target.value })}
                    placeholder="Profile name"
                  />
                </div>

                {electron && (
                  <div className="auth-profile__creds">
                    <CredField
                      label="Email"
                      variable="$EMAIL$"
                      value={cred.email}
                      onChange={(v) => updateCred(profile.id, { email: v })}
                    />
                    <CredField
                      label="Password"
                      variable="$PASSWORD$"
                      type="password"
                      value={cred.password}
                      onChange={(v) => updateCred(profile.id, { password: v })}
                    />
                    <CredField
                      label="2FA seed"
                      variable="$OTP$"
                      placeholder="Optional — TOTP secret"
                      value={cred.totpSeed}
                      onChange={(v) => updateCred(profile.id, { totpSeed: v })}
                    />
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
                    {busyId === profile.id ? "Signing in…" : "Test sign in"}
                  </button>
                  <span className="auth-profile__tokens">
                    {profile.tokensUpdatedAt
                      ? `Signed in ${formatRelativeTime(profile.tokensUpdatedAt)}`
                      : "Not signed in yet"}
                  </span>
                  <button
                    type="button"
                    className="btn btn--danger-outline btn--sm auth-profile__delete"
                    onClick={() => removeProfile(profile.id)}
                  >
                    Delete profile
                  </button>
                </div>
              </div>
            );
          })
        )}

        <button type="button" className="btn btn--outline auth-profiles__add" onClick={addProfile}>
          + Add sign-in profile
        </button>
      </div>
    </div>
  );
}

/** One inline credential input with its $VARIABLE$ tag. */
function CredField({
  label,
  variable,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  variable: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="auth-profile__cred-field">
      <label className="auth-profile__cred-label">
        {label}
        <code className="auth-profile__var">{variable}</code>
      </label>
      <input
        className="input input--compact"
        type={type}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
