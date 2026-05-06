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

const ENTER_MS = 180;
const EXIT_MS = 140;

/**
 * App-level settings (theme, defaults, optional credentials in Electron).
 * Reuses the .project-settings-overlay panel chrome so this matches the
 * project + test settings overlays — single column, ~640px wide, sections
 * stacked with their own headings rather than a side-nav.
 */
export default function SettingsOverlay() {
  const { settingsOpen, closeSettings } = useSidebar();
  const [animState, setAnimState] = useState<"entering" | "visible" | "exiting">("entering");
  const [mounted, setMounted] = useState(false);

  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<UserSettings | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!settingsOpen) return;
    setAnimState("entering");
    requestAnimationFrame(() => requestAnimationFrame(() => setAnimState("visible")));
    if (!settings) {
      fetch("/api/settings").then((r) => r.json()).then(setSettings);
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

  const showCredentials = mounted && isElectronRuntime();

  return (
    <div
      className={`project-settings-overlay project-settings-overlay--${animState}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      style={{ transitionDuration: animState === "exiting" ? `${EXIT_MS}ms` : `${ENTER_MS}ms` }}
    >
      <div
        className="project-settings-overlay__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-settings-title"
      >
        <header className="project-settings-overlay__header">
          <span id="app-settings-title" className="project-settings-overlay__title">
            Settings
          </span>
          <button
            type="button"
            className="icon-btn project-settings-overlay__close"
            onClick={handleClose}
            title="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="project-settings-overlay__body">
          <section className="settings-section">
            <h3 className="settings-section__title">General</h3>

            {mounted && (
              <div className="settings-section__row">
                <span className="settings-section__label">Theme</span>
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
              </div>
            )}

            <div className="settings-section__row">
              <div>
                <p className="settings-section__label">Alert notifications</p>
                <p className="settings-section__hint">Notify me when a report run finishes.</p>
              </div>
              <Toggle
                checked={settings?.alertNotifications ?? false}
                disabled={!settings}
                onChange={(v) => settings && saveSettings({ ...settings, alertNotifications: v })}
                label="Alert notifications"
              />
            </div>

            <div className="settings-section__actions">
              <button
                onClick={() => signOut({ callbackUrl: "/sign-in" })}
                className="btn btn--outline"
              >
                Sign out
              </button>
            </div>
          </section>

          <hr className="project-settings-overlay__divider" />

          <section className="settings-section">
            <h3 className="settings-section__title">Defaults</h3>
            <p className="settings-section__hint">Applied to new projects.</p>

            {settings ? (
              <>
                <BreakpointEditor
                  breakpoints={settings.defaultBreakpoints}
                  onChange={(bp) => saveSettings({ ...settings, defaultBreakpoints: bp })}
                />
                <div className="settings-section__row settings-section__row--column">
                  <span className="settings-section__label">Variants</span>
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
                </div>
              </>
            ) : (
              <p className="loader-text">Loading...</p>
            )}
          </section>

          {showCredentials && (
            <>
              <hr className="project-settings-overlay__divider" />
              <section className="settings-section">
                <h3 className="settings-section__title">Credentials</h3>
                <CredentialsSettings />
              </section>
            </>
          )}
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
