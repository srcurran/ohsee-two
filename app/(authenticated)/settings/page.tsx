"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import BreakpointEditor from "@/components/settings/BreakpointEditor";
import CredentialsSettings from "@/components/settings/CredentialsSettings";
import { BUILT_IN_VARIANTS } from "@/lib/constants";
import type { UserSettings } from "@/lib/types";
import { isElectronRuntime } from "@/lib/electron";

type Tab = "general" | "defaults" | "credentials";

export default function SettingsPage() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("general");

  // Defaults state
  const [settings, setSettings] = useState<UserSettings | null>(null);

  const user = session?.user;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setSettings);
  }, []);

  // Autosave: every settings mutation hits the API immediately. No manual
  // Save button — the overlay is the primary entry point and also autosaves.
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
      ? current.filter((v: string) => v !== id)
      : [...current, id];
    saveSettings({ ...settings, defaultVariants: next });
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "defaults", label: "Defaults" },
    ...(mounted && isElectronRuntime() ? [{ id: "credentials" as Tab, label: "Credentials" }] : []),
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-col gap-[16px] px-[24px] py-[20px] animate-card-in">
        <h1 className="text-[48px] text-foreground">Settings</h1>

        {/* Tabs */}
        <div className="border-b border-border-secondary">
          <div className="flex items-center gap-[24px]">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative py-[12px] text-[14px] text-foreground ${
                  activeTab === tab.id ? "font-bold" : "font-normal"
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <span className="absolute bottom-[-1px] left-0 right-0 h-[4px] bg-foreground" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-[24px] py-[24px]">
        <div className="max-w-[560px]">
          {activeTab === "general" && (
            <div>
              {/* Profile */}
              <section className="mb-[32px] animate-card-in" style={{ animationDelay: "0ms" }}>
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
              </section>

              {/* Theme */}
              {mounted && (
                <section className="mb-[32px] animate-card-in" style={{ animationDelay: "50ms" }}>
                  <p className="mb-[8px] text-[14px] text-foreground">Theme</p>
                  <div className="flex w-fit rounded-[8px] bg-surface-tertiary p-[3px]">
                    {(["light", "dark", "system"] as const).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setTheme(opt)}
                        className={`rounded-[6px] px-[16px] py-[6px] text-[14px] capitalize transition-colors ${
                          theme === opt
                            ? "bg-surface-content font-bold shadow-sm"
                            : "text-text-muted hover:text-foreground"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Alert notifications */}
              <section className="mb-[32px] animate-card-in" style={{ animationDelay: "75ms" }}>
                <p className="mb-[8px] text-[14px] text-foreground">Alert notifications</p>
                <label className="flex items-center gap-[8px] text-[14px] text-foreground">
                  <input
                    type="checkbox"
                    checked={settings?.alertNotifications ?? false}
                    onChange={(e) => settings && saveSettings({ ...settings, alertNotifications: e.target.checked })}
                    className="h-[16px] w-[16px]"
                    disabled={!settings}
                  />
                  Notify me when a report run finishes
                </label>
              </section>

              {/* Sign out */}
              <section className="animate-card-in" style={{ animationDelay: "100ms" }}>
                <button
                  onClick={() => signOut({ callbackUrl: "/sign-in" })}
                  className="rounded-[8px] px-[16px] py-[8px] text-[14px] text-text-muted transition-colors hover:bg-surface-tertiary hover:text-foreground"
                >
                  Sign out
                </button>
              </section>
            </div>
          )}

          {activeTab === "credentials" && <CredentialsSettings />}

          {activeTab === "defaults" && (
            <div>
              {settings ? (
                <>
                  <p className="mb-[24px] text-[14px] text-text-muted animate-card-in">
                    Applied to new projects by default.
                  </p>

                  {/* Breakpoints */}
                  <section className="mb-[32px] animate-card-in" style={{ animationDelay: "50ms" }}>
                    <BreakpointEditor
                      breakpoints={settings.defaultBreakpoints}
                      onChange={(bp) => saveSettings({ ...settings, defaultBreakpoints: bp })}
                    />
                  </section>

                  {/* Variants */}
                  <section className="mb-[32px] animate-card-in" style={{ animationDelay: "100ms" }}>
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
                </>
              ) : (
                <p className="text-text-muted">Loading...</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
