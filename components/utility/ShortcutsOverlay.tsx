"use client";

/** Keyboard-shortcut cheat sheet, toggled with Cmd/Ctrl + / (or the app
 * settings flyout). Open state lives in SidebarProvider so the global shortcut
 * hook can toggle it from anywhere. Reuses the .modal backdrop; the panel is
 * its own grid of sections. */

import { useEffect } from "react";
import { useSidebar } from "@/components/utility/SidebarProvider";
import { Icon } from "@/components/utility/Icon";

interface Shortcut {
  keys: string[];
  label: string;
}

const SECTIONS: { title: string; items: Shortcut[] }[] = [
  {
    title: "Navigate",
    items: [
      { keys: ["⌘", "⌥", "↑"], label: "Previous test" },
      { keys: ["⌘", "⌥", "↓"], label: "Next test" },
      { keys: ["⌘", "."], label: "Toggle sidebar" },
    ],
  },
  {
    title: "Create & run",
    items: [
      { keys: ["⌘", "N"], label: "New test" },
      { keys: ["⌘", "⇧", "N"], label: "New site" },
      { keys: ["⌘", "⏎"], label: "Run current test" },
    ],
  },
  {
    title: "Settings",
    items: [
      { keys: ["⌘", ","], label: "Test settings" },
      { keys: ["⌘", "⇧", ","], label: "Site settings" },
      { keys: ["⌘", "/"], label: "This menu" },
    ],
  },
  {
    title: "Report view",
    items: [
      { keys: ["⌘", "1–8"], label: "Screen size / variant" },
      { keys: ["⌘", "9"], label: "All pages" },
      { keys: ["⌘", "0"], label: "Changes only" },
    ],
  },
];

export default function ShortcutsOverlay() {
  const { shortcutsOpen, closeShortcuts } = useSidebar();

  useEffect(() => {
    if (!shortcutsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeShortcuts();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcutsOpen, closeShortcuts]);

  if (!shortcutsOpen) return null;

  return (
    <div className="modal" onClick={closeShortcuts}>
      <div
        className="shortcuts"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts__header">
          <h2 className="shortcuts__title">Keyboard shortcuts</h2>
          <button className="icon-btn" onClick={closeShortcuts} title="Close">
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="shortcuts__grid">
          {SECTIONS.map((section) => (
            <section key={section.title} className="shortcuts__section">
              <h3 className="shortcuts__section-title">{section.title}</h3>
              <ul className="shortcuts__list">
                {section.items.map((item) => (
                  <li key={item.label} className="shortcuts__row">
                    <span className="shortcuts__label">{item.label}</span>
                    <span className="shortcuts__keys">
                      {item.keys.map((k, i) => (
                        <kbd key={`${item.label}-${i}`} className="shortcuts__key">
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
