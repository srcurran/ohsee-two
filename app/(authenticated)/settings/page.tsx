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
    <div className="page-shell">
      <div className="page-header animate-card-in">
        <h1 className="page-header__title page-header__title--xl">Settings</h1>

        <div className="tab-bar">
          <div className="tab-bar__list">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`tab ${activeTab === tab.id ? "tab--active" : ""}`}
              >
                {tab.label}
                {activeTab === tab.id && <span className="tab__indicator" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="page-shell__body">
        <div style={{ maxWidth: 560 }}>
          {activeTab === "general" && (
            <div>
              <section className="section-block animate-card-in" style={{ animationDelay: "0ms" }}>
                <div className="row row--lg">
                  {user?.image ? (
                    <img
                      src={user.image}
                      alt={user.name || "User"}
                      width={48}
                      height={48}
                      style={{ borderRadius: "var(--radius-full)" }}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span
                      className="center"
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: "var(--radius-full)",
                        background: "var(--accent-yellow)",
                        fontSize: 18,
                        fontWeight: "var(--weight-bold)",
                        color: "var(--foreground)",
                      }}
                    >
                      {user?.name?.charAt(0).toUpperCase() || "?"}
                    </span>
                  )}
                  <div>
                    <p style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--weight-bold)", color: "var(--foreground)" }}>{user?.name}</p>
                    <p style={{ fontSize: "var(--font-size-base)", color: "var(--text-muted)" }}>{user?.email}</p>
                  </div>
                </div>
              </section>

              {mounted && (
                <section className="section-block animate-card-in" style={{ animationDelay: "50ms" }}>
                  <p className="section-heading" style={{ fontWeight: "var(--weight-regular)" }}>Theme</p>
                  <div className="segmented" style={{ width: "fit-content" }}>
                    {(["light", "dark", "system"] as const).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setTheme(opt)}
                        className={`segmented__item ${theme === opt ? "segmented__item--active" : ""}`}
                        style={{ padding: "var(--space-1-5) var(--space-4)", textTransform: "capitalize", fontSize: "var(--font-size-base)" }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section className="section-block animate-card-in" style={{ animationDelay: "75ms" }}>
                <p className="section-heading" style={{ fontWeight: "var(--weight-regular)" }}>Alert notifications</p>
                <label className="variant-option">
                  <input
                    type="checkbox"
                    checked={settings?.alertNotifications ?? false}
                    onChange={(e) => settings && saveSettings({ ...settings, alertNotifications: e.target.checked })}
                    className="checkbox"
                    disabled={!settings}
                  />
                  Notify me when a report run finishes
                </label>
              </section>

              <section className="animate-card-in" style={{ animationDelay: "100ms" }}>
                <button onClick={() => signOut({ callbackUrl: "/sign-in" })} className="btn btn--ghost">
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
                  <p className="section-body animate-card-in" style={{ marginBottom: "var(--space-6)" }}>
                    Applied to new projects by default.
                  </p>

                  <section className="section-block animate-card-in" style={{ animationDelay: "50ms" }}>
                    <BreakpointEditor
                      breakpoints={settings.defaultBreakpoints}
                      onChange={(bp) => saveSettings({ ...settings, defaultBreakpoints: bp })}
                    />
                  </section>

                  <section className="section-block animate-card-in" style={{ animationDelay: "100ms" }}>
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
                </>
              ) : (
                <p className="loader-text">Loading...</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
