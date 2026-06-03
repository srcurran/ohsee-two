"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ScriptEditor from "@/components/settings/shared/ScriptEditor";
import Field, { CopyButton } from "@/components/utility/Field";
import Segmented from "@/components/utility/Segmented";
import { getOhsee, isElectronRuntime } from "@/lib/electron";
import { resolveVaultCredentials } from "@/lib/vault-resolve";
import { formatRelativeTime } from "@/lib/relative-time";
import type { AuthProfile, Project } from "@/lib/types";

/** Inline credential fields, mirrored from the profile's Keychain entry.
 *  `$OTP$` is either a TOTP seed (a fresh code is generated each run) or a
 *  fixed/static code — `otpMode` picks which. */
interface Cred {
  email: string;
  password: string;
  otpMode: "totp" | "static";
  otpValue: string;
}
const EMPTY_CRED: Cred = { email: "", password: "", otpMode: "totp", otpValue: "" };

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
  // Errors are per-profile so they render next to that profile's button.
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  const setError = (profileId: string, message: string | null) =>
    setErrorById((prev) => {
      if (message === null) {
        const next = { ...prev };
        delete next[profileId];
        return next;
      }
      return { ...prev, [profileId]: message };
    });

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
                otpMode: e.staticOtp ? "static" : "totp",
                otpValue: e.staticOtp ?? e.totpSeed ?? "",
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
      const otp = c.otpValue.trim();
      await o.vault.set(key, {
        label: c.email,
        secret: c.password,
        totpSeed: c.otpMode === "totp" && otp ? otp : undefined,
        staticOtp: c.otpMode === "static" && otp ? otp : undefined,
      });
      if (!profile?.vaultEntryId) update(profileId, { vaultEntryId: key }, true);
      setError(profileId, null);
    } catch (err) {
      setError(profileId, err instanceof Error ? err.message : String(err));
    }
  };

  const generate = async (profile: AuthProfile) => {
    setBusyId(profile.id);
    setError(profile.id, null);
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
        setError(profile.id, e.error || "Sign-in test failed");
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
      <div className="stack stack--3xl">

        {profiles.length === 0 ? (
          <p className="auth-profiles__empty">No sign-in profiles yet.</p>
        ) : (
          profiles.map((profile) => {
            const cred = credsById[profile.id] ?? EMPTY_CRED;
            return (
                <>
              <div key={profile.id} className="auth-profile stack stack--xl">
                <div className="stack">
                  <h2>Test name</h2>
                  <input
                    className="auth-profile__name"
                    value={profile.name}
                    onChange={(e) => update(profile.id, { name: e.target.value })}
                    placeholder="Profile name"
                  />
                </div>

                {electron && (
                  <div className="stack stack--sm">
                    <h2>Credentials</h2>
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
                    <div className="stack stack--xs">
                      <label className="auth-profile__cred-label row row--sm">
                        Two-factor
                        <code className="field__var">$OTP$</code>
                        <Segmented
                          options={[
                            { value: "totp", label: "TOTP seed" },
                            { value: "static", label: "Fixed code" },
                          ]}
                          value={cred.otpMode}
                          onChange={(otpMode) => updateCred(profile.id, { otpMode })}
                        />
                      </label>
                      <div className="field__control">
                        <input
                          className="input input--with-trailing"
                          value={cred.otpValue}
                          placeholder={
                            cred.otpMode === "totp"
                              ? "Optional — TOTP secret (base32)"
                              : "Optional — fixed code"
                          }
                          spellCheck={false}
                          autoComplete="off"
                          onChange={(e) => updateCred(profile.id, { otpValue: e.target.value })}
                        />
                        <div className="field__trailing"><CopyButton value="$OTP$" /></div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="stack">
                <h2>Log in script</h2>
                <ScriptEditor
                  value={profile.loginScript}
                  onChange={(s) => update(profile.id, { loginScript: s })}
                  defaultUrl={project?.prodUrl}
                />
                </div>
                <div className="row">
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
                {errorById[profile.id] && (
                  <p className="auth-profile__error">{errorById[profile.id]}</p>
                )}
              </div>
            <div className="auth-keyline" />
            </>
            );
          })
        )}

        <button type="button" className="btn btn--outline self-start" onClick={addProfile}>
          + Add sign-in profile
        </button>
      </div>
    </div>
  );
}

/** One inline credential input with its $VARIABLE$ tag and a button that
 *  copies the variable for pasting into the sign-in script. */
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
    <Field
      label={label}
      labelSuffix={<code className="field__var">{variable}</code>}
      copyValue={variable}
      type={type}
      value={value}
      placeholder={placeholder}
      spellCheck={false}
      autoComplete="off"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
