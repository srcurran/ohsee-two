/** Global "Test Speed / fast mode" toggle. Drives the capture-concurrency cap
 *  (8 ↔ 16). Reads and writes the user settings directly so it can be dropped
 *  into any settings surface (app settings, per-test / per-project settings).
 *  The setting is global — it applies to every test. */

"use client";

import { useEffect, useState } from "react";
import type { UserSettings } from "@/lib/types";

export default function FastModeToggle() {
  const [fast, setFast] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: UserSettings) => {
        if (!cancelled) setFast(!!s.fastMode);
      })
      .catch(() => {
        if (!cancelled) setFast(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = (next: boolean) => {
    setFast(next);
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fastMode: next }),
    });
  };

  return (
    <div className="test-settings-section__speed stack stack--sm">
      <h3>Test Speed</h3>
      <label className="variant-option">
        <input
          type="checkbox"
          checked={!!fast}
          disabled={fast === null}
          onChange={(e) => handleChange(e.target.checked)}
          className="checkbox"
        />
        Enable fast mode
      </label>
      <p className="settings-section__hint">
        Faster runs, but more likely to hit errors. Applies to all tests.
      </p>
    </div>
  );
}
