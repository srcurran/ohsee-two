"use client";

import type { AuthProfile } from "@/lib/types";

/**
 * Picks the site-level sign-in profile that seeds an advanced test's session
 * (so the script starts already authenticated). "Manage…" jumps to the
 * profiles overlay.
 */
export default function AuthProfileSelect({
  profiles,
  value,
  onChange,
  onManage,
}: {
  profiles: AuthProfile[];
  value?: string;
  onChange: (id: string | undefined) => void;
  onManage: () => void;
}) {
  return (
    <div className="credentials-section__vault">
      <label className="credentials-section__label" htmlFor="auth-profile-select">
        Sign-in profile
      </label>
      <select
        id="auth-profile-select"
        className="credentials-section__select"
        value={value ?? ""}
        onChange={(e) => {
          if (e.target.value === "__manage") {
            onManage();
            return;
          }
          onChange(e.target.value || undefined);
        }}
      >
        <option value="">No sign-in (public pages)</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.tokensUpdatedAt ? "" : " · not signed in yet"}
          </option>
        ))}
        <option value="__manage">Manage sign-in profiles…</option>
      </select>
      <p className="credentials-section__hint">
        Runs this test signed in using the selected profile.
      </p>
    </div>
  );
}
