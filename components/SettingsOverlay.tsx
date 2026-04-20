"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { useSidebar } from "./SidebarProvider";
import BreakpointEditor from "@/components/settings/BreakpointEditor";
import CredentialsSettings from "@/components/settings/CredentialsSettings";
import { BUILT_IN_VARIANTS } from "@/lib/constants";
import type { UserSettings } from "@/lib/types";
import { isElectronRuntime } from "@/lib/electron";

type Tab = "general" | "defaults" | "credentials";

const PANEL = { top: 28, right: 28, bottom: 28, left: 28 };
const ANIM_MS = 200;
const EXIT_MS = 150;
const ANIM_EASE = "cubic-bezier(0.2, 0, 0, 1)";

export default function SettingsOverlay() {
  const { settingsOpen, closeSettings } = useSidebar();
  const [animState, setAnimState] = useState<"entering" | "visible" | "exiting">("entering");
  const [mounted, setMounted] = useState(false);

  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [settings, setSettings] = useState<UserSettings | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!settingsOpen) return;
    setAnimState("entering");
    requestAnimationFrame(() => setAnimState("visible"));
    if (!settings) {
      fetch("/api/settings")
        .then((r) => r.json())
        .then(setSettings);
    }
  }, [settingsOpen, settings]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen]);

  const handleClose = () => {
    setAnimState("exiting");
    setTimeout(closeSettings, EXIT_MS);
  };

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
    const next = current.includes(id) ? current.filter((v) => v !== id) : [...current, id];
    saveSettings({ ...settings, defaultVariants: next });
  };

  if (!settingsOpen) return null;

  const tabs: { id: Tab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "defaults", label: "Defaults" },
    ...(mounted && isElectronRuntime() ? [{ id: "credentials" as Tab, label: "Credentials" }] : []),
  ];

  const panelStyle: React.CSSProperties = animState === "exiting"
    ? {
        position: "fixed",
        top: PANEL.top,
        left: PANEL.left,
        width: `calc(100vw - ${PANEL.left + PANEL.right}px)`,
        height: `calc(100vh - ${PANEL.top + PANEL.bottom}px)`,
        borderRadius: 12,
        opacity: 0,
        transform: "scale(0.96)",
        transition: `opacity ${EXIT_MS}ms ease-in, transform ${EXIT_MS}ms ease-in`,
      }
    : {
        position: "fixed",
        top: PANEL.top,
        left: PANEL.left,
        width: `calc(100vw - ${PANEL.left + PANEL.right}px)`,
        height: `calc(100vh - ${PANEL.top + PANEL.bottom}px)`,
        borderRadius: 12,
        opacity: animState === "entering" ? 0 : 1,
        transform: animState === "entering" ? "scale(0.98)" : "scale(1)",
        transition: `opacity ${ANIM_MS}ms ${ANIM_EASE}, transform ${ANIM_MS}ms ${ANIM_EASE}`,
      };

  return (
    <div
      className={`settings-overlay ${animState === "visible" ? "settings-overlay--visible" : "settings-overlay--hidden"}`}
      style={{ transitionDuration: animState === "exiting" ? `${EXIT_MS}ms` : `${ANIM_MS}ms` }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="settings-overlay__panel" style={panelStyle}>
        <aside className="settings-overlay__nav">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`settings-overlay__nav-item ${active ? "settings-overlay__nav-item--active" : ""}`}
              >
                {tab.label}
              </button>
            );
          })}
        </aside>

        <div className="settings-overlay__content">
          <button
            onClick={handleClose}
            title="Close settings"
            className="icon-btn icon-btn--lg settings-overlay__close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>

          <div className="settings-overlay__body">
            <div style={{ maxWidth: 560 }}>
              {activeTab === "general" && (
                <div>
                  {mounted && (
                    <section className="section-block">
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

                  <section className="section-block">
                    <div className="row row--between row--lg">
                      <div>
                        <p style={{ fontSize: "var(--font-size-base)", color: "var(--foreground)" }}>Alert notifications</p>
                        <p style={{ fontSize: "var(--font-size-md)", color: "var(--text-muted)" }}>Notify me when a report run finishes.</p>
                      </div>
                      <Toggle
                        checked={settings?.alertNotifications ?? false}
                        disabled={!settings}
                        onChange={(v) => settings && saveSettings({ ...settings, alertNotifications: v })}
                        label="Alert notifications"
                      />
                    </div>
                  </section>

                  <section>
                    <button
                      onClick={() => signOut({ callbackUrl: "/sign-in" })}
                      className="btn btn--ghost"
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
                      <p className="section-body" style={{ marginBottom: "var(--space-6)" }}>
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
                    </>
                  ) : (
                    <p className="loader-text">Loading...</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`toggle ${checked ? "toggle--on" : "toggle--off"}`}
    >
      <span className={`toggle__knob ${checked ? "toggle__knob--on" : "toggle__knob--off"}`} />
    </button>
  );
}
