/** Credentials section inside the test-settings overlay — toggle for
 * minting an auth session before capture, plus an option to copy
 * credentials from a sibling test. */

"use client";

import type { SiteTest, TestCredentials } from "@/lib/types";

interface CredentialsSectionProps {
  credentials: TestCredentials | undefined;
  otherTests: SiteTest[];
  onChange: (next: TestCredentials | undefined) => void;
}

export function CredentialsSection({
  credentials,
  otherTests,
  onChange,
}: CredentialsSectionProps) {
  const enabled = credentials?.enabled === true;
  const copyFromId = credentials?.copyFromTestId ?? "";

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

      <div className="credentials-section__row">
        <label className="credentials-section__label">Copy from other settings…</label>
        <select
          className="input input--compact"
          value={copyFromId}
          onChange={(e) =>
            onChange({
              ...credentials,
              copyFromTestId: e.target.value || undefined,
            })
          }
          disabled={otherTests.length === 0}
        >
          <option value="">Don&apos;t copy</option>
          {otherTests.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {!enabled && !copyFromId && (
        <p className="credentials-section__hint">
          No credentials configured — runs use the project default.
        </p>
      )}
    </div>
  );
}
