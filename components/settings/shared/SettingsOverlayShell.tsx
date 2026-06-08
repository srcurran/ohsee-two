"use client";

import type { ReactNode } from "react";

interface Props {
  animState: "entering" | "visible" | "exiting";
  enterMs: number;
  exitMs: number;
  /** Backdrop click calls this (the parent's close button does too). */
  onBackdropClose: () => void;
  /** id of the title element, for aria-labelledby. */
  labelledBy: string;
  /** Header content — title / rename field / back button + close. Varies per
   *  overlay, so the shell only owns the wrapper, not the contents. */
  header: ReactNode;
  children: ReactNode;
}

/**
 * The shared chrome for the three settings overlays (app / project / test):
 * the scrim, the centered panel, the header bar, and the scrolling body —
 * plus the backdrop-to-close and mount/exit transition wiring. Pair it with
 * `useOverlayAnim` for the animState/handleClose it expects. Each overlay
 * supplies its own header content and body.
 */
export default function SettingsOverlayShell({
  animState,
  enterMs,
  exitMs,
  onBackdropClose,
  labelledBy,
  header,
  children,
}: Props) {
  return (
    <div
      className={`settings-overlay settings-overlay--${animState}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onBackdropClose();
      }}
      style={{ transitionDuration: animState === "exiting" ? `${exitMs}ms` : `${enterMs}ms` }}
    >
      <div
        className="settings-overlay__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        <header className="settings-overlay__header row row--between">{header}</header>
        <div className="settings-overlay__body">{children}</div>
      </div>
    </div>
  );
}
