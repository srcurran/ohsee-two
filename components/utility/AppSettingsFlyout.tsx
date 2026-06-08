"use client";

/** Compact app-settings flyout anchored to the sidebar-footer gear: dark-mode
 * toggle, run-finished notifications toggle, and log out — plus links to the
 * shortcuts cheat sheet and the full settings overlay (which still owns the
 * heavier stuff: capture defaults, credentials). Reuses the .dropdown chrome. */

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { useSidebar } from "@/components/utility/SidebarProvider";
import { Icon } from "@/components/utility/Icon";
import type { UserSettings } from "@/lib/types";

export default function AppSettingsFlyout() {
  const { openSettings, openShortcuts } = useSidebar();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  useEffect(() => setMounted(true), []);

  // Load settings the first time the flyout opens (the notifications toggle
  // needs the full object so a save round-trips the rest unchanged).
  useEffect(() => {
    if (open && !settings) {
      fetch("/api/settings")
        .then((r) => r.json())
        .then(setSettings)
        .catch(() => {});
    }
  }, [open, settings]);

  const isDark = mounted && resolvedTheme === "dark";
  const close = () => setOpen(false);

  const saveAlerts = (v: boolean) => {
    if (!settings) return;
    const next = { ...settings, alertNotifications: v };
    setSettings(next);
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
  };

  return (
    <div className="app-settings">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Settings"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Settings"
        className="icon-btn"
      >
        <Icon name="settings" size={16} />
      </button>

      {open && (
        <>
          <div className="dropdown-backdrop" onClick={close} />
          <div className="dropdown-panel app-settings__menu" role="menu">
            <div className="app-settings__row">
              <span className="app-settings__label">Dark mode</span>
              <Toggle
                checked={isDark}
                disabled={!mounted}
                onChange={(v) => setTheme(v ? "dark" : "light")}
                label="Dark mode"
              />
            </div>
            <div className="app-settings__row">
              <span className="app-settings__label">Notifications</span>
              <Toggle
                checked={settings?.alertNotifications ?? false}
                disabled={!settings}
                onChange={saveAlerts}
                label="Run-finished notifications"
              />
            </div>

            <div className="app-settings__divider" />

            <button
              className="dropdown-item app-settings__item"
              onClick={() => {
                close();
                openShortcuts();
              }}
            >
              <span className="dropdown-item__label">Keyboard shortcuts</span>
              <kbd className="app-settings__kbd">⌘/</kbd>
            </button>
            <button
              className="dropdown-item"
              onClick={() => {
                close();
                openSettings();
              }}
            >
              <span className="dropdown-item__label">All settings…</span>
            </button>
            <button
              className="dropdown-item app-settings__logout"
              onClick={() => signOut({ callbackUrl: "/sign-in" })}
            >
              <span className="dropdown-item__label">Log out</span>
            </button>
          </div>
        </>
      )}
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
