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
      <div className="flex h-full items-center justify-center">
        <p className="text-text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-[8px] text-[32px] text-foreground">Defaults</h1>
      <p className="mb-[32px] text-[14px] text-text-muted">
        Applied to new projects by default.
      </p>

      {/* Breakpoints */}
      <section className="mb-[32px]">
        <BreakpointEditor
          breakpoints={settings.defaultBreakpoints}
          onChange={(bp) => saveSettings({ ...settings, defaultBreakpoints: bp })}
        />
      </section>

      {/* Variants */}
      <section className="mb-[32px]">
        <p className="mb-[8px] text-[14px] text-foreground">Variants</p>
        <div className="flex gap-[16px]">
          {BUILT_IN_VARIANTS.map((v) => {
            const active = (settings.defaultVariants || []).includes(v.id);
            return (
              <label
                key={v.id}
                className="flex items-center gap-[8px] text-[14px] text-foreground"
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleVariant(v.id)}
                  className="h-[16px] w-[16px]"
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
