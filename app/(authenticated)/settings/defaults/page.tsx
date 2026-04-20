"use client";

import { useEffect, useState } from "react";
import BreakpointEditor from "@/components/settings/BreakpointEditor";
import { BUILT_IN_VARIANTS } from "@/lib/constants";
import type { UserSettings } from "@/lib/types";

export default function DefaultsSettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setSettings);
  }, []);

  const saveSettings = (next: UserSettings) => {
    setSettings(next);
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
  };

  const toggleVariant = (id: string) => {
    if (!settings) return;
    const current = settings.defaultVariants || [];
    const next = current.includes(id)
      ? current.filter((v) => v !== id)
      : [...current, id];
    saveSettings({ ...settings, defaultVariants: next });
  };

  if (!settings) {
    return (
      <div className="center" style={{ height: "100%" }}>
        <p className="loader-text">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ marginBottom: "var(--space-2)", fontSize: "var(--font-size-5xl)", color: "var(--foreground)" }}>Defaults</h1>
      <p className="section-body" style={{ marginBottom: "var(--space-8)" }}>
        Applied to new projects by default.
      </p>

      <section className="section-block">
        <BreakpointEditor
          breakpoints={settings.defaultBreakpoints}
          onChange={(bp) => saveSettings({ ...settings, defaultBreakpoints: bp })}
        />
      </section>

      <section className="section-block">
        <p className="section-heading" style={{ fontWeight: "var(--weight-regular)" }}>Variants</p>
        <div className="variant-list">
          {BUILT_IN_VARIANTS.map((v) => {
            const active = (settings.defaultVariants || []).includes(v.id);
            return (
              <label key={v.id} className="variant-option">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleVariant(v.id)}
                  className="checkbox"
                />
                {v.label}
              </label>
            );
          })}
        </div>
      </section>
    </div>
  );
}
