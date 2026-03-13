"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { BREAKPOINTS, BUILT_IN_VARIANTS } from "@/lib/constants";
import type { UserSettings } from "@/lib/types";

const ALL_BREAKPOINTS = [...BREAKPOINTS];

export default function SettingsPage() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const user = session?.user;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setSettings);
  }, []);

  const toggleBreakpoint = (bp: number) => {
    if (!settings) return;
    const current = settings.defaultBreakpoints;
    const next = current.includes(bp)
      ? current.filter((b) => b !== bp)
      : [...current, bp].sort((a, b) => b - a);
    if (next.length === 0) return; // Must keep at least one
    setSettings({ ...settings, defaultBreakpoints: next });
  };

  const toggleVariant = (id: string) => {
    if (!settings) return;
    const current = settings.defaultVariants || [];
    const next = current.includes(id)
      ? current.filter((v) => v !== id)
      : [...current, id];
    setSettings({ ...settings, defaultVariants: next });
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[640px] px-[24px] py-[48px]">
      <h1 className="mb-[32px] text-[28px] font-bold text-foreground">Settings</h1>

      {/* Account info */}
      <section className="mb-[32px]">
        <h2 className="mb-[16px] text-[11px] uppercase tracking-wider text-text-subtle">
          Account
        </h2>
        <div className="rounded-[12px] border border-border-primary bg-surface-content p-[20px]">
          <div className="flex items-center gap-[16px]">
            {user?.image ? (
              <img
                src={user.image}
                alt={user.name || "User"}
                width={48}
                height={48}
                className="rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="flex h-[48px] w-[48px] items-center justify-center rounded-full bg-accent-yellow text-[18px] font-bold text-foreground">
                {user?.name?.charAt(0).toUpperCase() || "?"}
              </span>
            )}
            <div>
              <p className="text-[16px] font-bold text-foreground">{user?.name}</p>
              <p className="text-[14px] text-text-muted">{user?.email}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Theme */}
      {mounted && (
        <section className="mb-[32px]">
          <h2 className="mb-[16px] text-[11px] uppercase tracking-wider text-text-subtle">
            Appearance
          </h2>
          <div className="rounded-[12px] border border-border-primary bg-surface-content p-[20px]">
            <p className="mb-[8px] text-[14px] text-foreground">Theme</p>
            <div className="flex rounded-[8px] bg-surface-tertiary p-[3px]">
              {(["light", "dark", "system"] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setTheme(opt)}
                  className={`flex-1 rounded-[6px] px-[12px] py-[6px] text-[14px] capitalize transition-colors ${
                    theme === opt
                      ? "bg-surface-content font-bold shadow-sm"
                      : "text-text-muted hover:text-foreground"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Default breakpoints */}
      <section className="mb-[32px]">
        <h2 className="mb-[16px] text-[11px] uppercase tracking-wider text-text-subtle">
          Default Breakpoints
        </h2>
        <div className="rounded-[12px] border border-border-primary bg-surface-content p-[20px]">
          <p className="mb-[12px] text-[13px] text-text-muted">
            These breakpoints will be selected by default for new projects.
          </p>
          <div className="flex flex-wrap gap-[8px]">
            {ALL_BREAKPOINTS.map((bp) => {
              const active = settings.defaultBreakpoints.includes(bp);
              return (
                <button
                  key={bp}
                  onClick={() => toggleBreakpoint(bp)}
                  className={`rounded-[8px] border px-[16px] py-[8px] text-[14px] transition-colors ${
                    active
                      ? "border-foreground bg-foreground/5 font-bold text-foreground"
                      : "border-border-primary text-text-muted hover:border-border-strong hover:text-foreground"
                  }`}
                >
                  {bp}px
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Default variants */}
      <section className="mb-[32px]">
        <h2 className="mb-[16px] text-[11px] uppercase tracking-wider text-text-subtle">
          Default Variants
        </h2>
        <div className="rounded-[12px] border border-border-primary bg-surface-content p-[20px]">
          <p className="mb-[12px] text-[13px] text-text-muted">
            These variants will be enabled by default for new projects.
          </p>
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
        </div>
      </section>

      {/* Save */}
      <div className="flex items-center gap-[12px]">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-[12px] bg-black px-[32px] py-[10px] text-[16px] font-bold text-white transition-all hover:shadow-elevation-md hover:-translate-y-[1px] disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {saved && (
          <span className="text-[14px] text-accent-green">Saved</span>
        )}
      </div>
    </div>
  );
}
