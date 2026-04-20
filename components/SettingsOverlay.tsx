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

  // Animate in when opened; lazy-load settings on first open.
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

  // Escape to close
  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  const handleClose = () => {
    setAnimState("exiting");
    setTimeout(closeSettings, EXIT_MS);
  };

  // Autosave for any settings change (no explicit Save button).
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
      className={`fixed inset-0 z-30 transition-colors ${
        animState === "visible" ? "bg-black/30" : "bg-transparent pointer-events-none"
      }`}
      style={{ transitionDuration: animState === "exiting" ? `${EXIT_MS}ms` : `${ANIM_MS}ms` }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className="flex overflow-hidden bg-surface-content shadow-elevation-lg"
        style={panelStyle}
      >
        {/* Left nav column — sections stack vertically. */}
        <aside className="flex w-[200px] shrink-0 flex-col gap-[4px] border-r border-black/[0.1] bg-[#fafafa] p-[16px]">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-[8px] px-[12px] py-[8px] text-left text-[14px] transition-colors ${
                  active
                    ? "bg-foreground/[0.06] font-semibold text-foreground"
                    : "text-text-secondary hover:bg-foreground/[0.03] hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </aside>

        {/* Right content column. Close button floats top-right. */}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <button
            onClick={handleClose}
            title="Close settings"
            className="absolute right-[16px] top-[16px] z-10 flex h-[40px] w-[40px] items-center justify-center rounded-[10px] text-text-subtle transition-all hover:bg-foreground/[0.05] hover:text-foreground"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>

          <div className="flex-1 overflow-y-auto px-[32px] py-[32px]">
            <div className="max-w-[560px]">
              {activeTab === "general" && (
                <div>
                  {mounted && (
                    <section className="mb-[32px]">
                      <p className="mb-[8px] text-[14px] text-foreground">Theme</p>
                      <div className="flex w-fit rounded-[8px] bg-surface-tertiary p-[3px]">
                        {(["light", "dark", "system"] as const).map((opt) => (
                          <button
                            key={opt}
                            onClick={() => setTheme(opt)}
                            className={`rounded-[6px] px-[16px] py-[6px] text-[14px] capitalize transition-colors ${
                              theme === opt
                                ? "bg-surface-content font-bold"
                                : "text-text-muted hover:text-foreground"
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  <section className="mb-[32px]">
                    <div className="flex items-center justify-between gap-[16px]">
                      <div>
                        <p className="text-[14px] text-foreground">Alert notifications</p>
                        <p className="text-[13px] text-text-muted">Notify me when a report run finishes.</p>
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
                      <p className="mb-[24px] text-[14px] text-text-muted">
                        Applied to new projects by default.
                      </p>
                      <section className="mb-[32px]">
                        <BreakpointEditor
                          breakpoints={settings.defaultBreakpoints}
                          onChange={(bp) => saveSettings({ ...settings, defaultBreakpoints: bp })}
                        />
                      </section>
                      <section className="mb-[32px]">
                        <p className="mb-[8px] text-[14px] text-foreground">Variants</p>
                        <div className="flex gap-[16px]">
                          {BUILT_IN_VARIANTS.map((v) => {
                            const active = (settings.defaultVariants || []).includes(v.id);
                            return (
                              <label key={v.id} className="flex items-center gap-[8px] text-[14px] text-foreground">
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
      className={`relative inline-flex h-[24px] w-[40px] shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${
        checked ? "bg-foreground" : "bg-foreground/20"
      }`}
    >
      <span
        className={`inline-block h-[18px] w-[18px] rounded-full bg-surface-content transition-transform ${
          checked ? "translate-x-[19px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}
