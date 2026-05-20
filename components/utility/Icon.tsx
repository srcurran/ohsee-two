/** Single source of truth for app iconography.
 *
 * Every glyph the app draws is registered in `ICONS` and rendered through
 * `<Icon name=… />`. Three flavours are supported:
 *
 *  - Vector icons honour `color` (drives stroke + fill via `currentColor`)
 *    and `stroke` (outline width). This is the common case.
 *  - Fixed-art icons (`google`, `sidebar-*`) carry intrinsic colors —
 *    `color`/`stroke` have no effect on them.
 *  - Raster icons point at an image file (`src`) and render an `<img>` —
 *    so a PNG asset drops in just as cleanly as an inline SVG.
 *
 * Outline widths are normalized to the 1.5 default; pass `stroke` only to
 * deviate deliberately.
 */

import type { CSSProperties, ReactNode } from "react";

export type IconName =
  | "close"
  | "chevron-left"
  | "chevron-right"
  | "chevron-down"
  | "arrow-up"
  | "arrow-left"
  | "edit"
  | "settings"
  | "plus"
  | "camera"
  | "playwright"
  | "trash"
  | "globe"
  | "warning"
  | "check"
  | "alert-circle"
  | "monitor"
  | "project-menu"
  | "play"
  | "dots"
  | "grip"
  | "google"
  | "sidebar-expanded"
  | "sidebar-collapsed";

/** Inline SVG icon. `body` elements paint with `currentColor` so the
 *  `color` prop drives them; `crisp` opts into pixel-snapped rendering. */
type VectorDef = { viewBox: string; body: ReactNode; crisp?: boolean };
/** Image-file icon — rendered as an `<img>`, ignores `color`/`stroke`. */
type RasterDef = { src: string };

const ICONS: Record<IconName, VectorDef | RasterDef> = {
  close: {
    viewBox: "0 0 24 24",
    body: <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" />,
  },
  "chevron-left": {
    viewBox: "0 0 24 24",
    body: <path d="M15 18l-6-6 6-6" stroke="currentColor" />,
  },
  "chevron-right": {
    viewBox: "0 0 24 24",
    body: <path d="M9 6l6 6-6 6" stroke="currentColor" />,
  },
  "chevron-down": {
    viewBox: "0 0 24 24",
    body: <path d="M6 9l6 6 6-6" stroke="currentColor" />,
  },
  "arrow-up": {
    viewBox: "0 0 20 20",
    body: <path d="M10 15V5M10 5l-4 4M10 5l4 4" stroke="currentColor" />,
  },
  "arrow-left": {
    viewBox: "0 0 24 24",
    body: <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" />,
  },
  edit: {
    viewBox: "0 0 24 24",
    body: <path d="M16.5 4.5l3 3L8 19l-4 1 1-4L16.5 4.5z" stroke="currentColor" />,
  },
  settings: {
    viewBox: "0 0 24 24",
    body: (
      <>
        <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" />
        <path
          d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
          stroke="currentColor"
        />
      </>
    ),
  },
  plus: {
    viewBox: "0 0 24 24",
    body: <path d="M12 5v14M5 12h14" stroke="currentColor" />,
  },
  camera: {
    viewBox: "0 0 24 24",
    body: (
      <>
        <path
          d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"
          stroke="currentColor"
        />
        <circle cx="12" cy="13" r="3.5" stroke="currentColor" />
      </>
    ),
  },
  playwright: {
    viewBox: "0 0 24 24",
    body: <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" stroke="currentColor" />,
  },
  trash: {
    viewBox: "0 0 24 24",
    body: (
      <path
        d="M4 7h16M9 7V4h6v3M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"
        stroke="currentColor"
      />
    ),
  },
  globe: {
    viewBox: "0 0 24 24",
    body: (
      <>
        <circle cx="12" cy="12" r="10" stroke="currentColor" />
        <path
          d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
          stroke="currentColor"
        />
      </>
    ),
  },
  warning: {
    viewBox: "0 0 24 24",
    body: (
      <>
        <path d="M12 3 1.5 21h21L12 3z" stroke="currentColor" />
        <path d="M12 10v5" stroke="currentColor" />
        <circle cx="12" cy="17.5" r="1" fill="currentColor" />
      </>
    ),
  },
  check: {
    viewBox: "0 0 24 24",
    body: <path d="M5 12l5 5 9-11" stroke="currentColor" />,
  },
  "alert-circle": {
    viewBox: "0 0 24 24",
    body: (
      <>
        <circle cx="12" cy="12" r="9" stroke="currentColor" />
        <path d="M12 7v6" stroke="currentColor" />
        <circle cx="12" cy="16.5" r="1" fill="currentColor" />
      </>
    ),
  },
  monitor: {
    viewBox: "0 0 24 24",
    body: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" />
        <path d="M3 9h18" stroke="currentColor" />
        <circle cx="6" cy="7" r="0.5" fill="currentColor" />
        <circle cx="8" cy="7" r="0.5" fill="currentColor" />
        <circle cx="10" cy="7" r="0.5" fill="currentColor" />
      </>
    ),
  },
  "project-menu": {
    viewBox: "0 0 24 24",
    body: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" />
        <circle cx="8" cy="6" r="2" fill="currentColor" />
        <circle cx="16" cy="12" r="2" fill="currentColor" />
        <circle cx="10" cy="18" r="2" fill="currentColor" />
      </>
    ),
  },
  play: {
    viewBox: "0 0 28 28",
    body: <path d="M8 5v18l16-9L8 5z" fill="currentColor" />,
  },
  dots: {
    viewBox: "0 0 24 24",
    body: (
      <>
        <circle cx="12" cy="5" r="1.5" fill="currentColor" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        <circle cx="12" cy="19" r="1.5" fill="currentColor" />
      </>
    ),
  },
  grip: {
    viewBox: "0 0 24 24",
    body: (
      <>
        <circle cx="9" cy="5" r="1.5" fill="currentColor" />
        <circle cx="15" cy="5" r="1.5" fill="currentColor" />
        <circle cx="9" cy="12" r="1.5" fill="currentColor" />
        <circle cx="15" cy="12" r="1.5" fill="currentColor" />
        <circle cx="9" cy="19" r="1.5" fill="currentColor" />
        <circle cx="15" cy="19" r="1.5" fill="currentColor" />
      </>
    ),
  },
  google: {
    viewBox: "0 0 24 24",
    body: (
      <>
        <path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
          fill="#4285F4"
        />
        <path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="#34A853"
        />
        <path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          fill="#FBBC05"
        />
        <path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          fill="#EA4335"
        />
      </>
    ),
  },
  "sidebar-expanded": {
    viewBox: "0 0 20 16",
    crisp: true,
    body: (
      <g clipPath="url(#icon-sidebar-expanded)">
        {/* Outer frame */}
        <rect x="1" width="18" height="1" fill="#333333" />
        <rect x="1" y="15" width="18" height="1" fill="#333333" />
        <rect x="20" y="1" width="14" height="1" transform="rotate(90 20 1)" fill="#333333" />
        <rect x="1" y="1" width="14" height="1" transform="rotate(90 1 1)" fill="#333333" />
        {/* Vertical divider + sidebar item lines */}
        <rect x="7" width="16" height="1" transform="rotate(90 7 0)" fill="#333333" />
        <line x1="2" y1="2.5" x2="5" y2="2.5" stroke="#A8A7A5" strokeWidth="1" />
        <line x1="2" y1="4.5" x2="5" y2="4.5" stroke="#A8A7A5" strokeWidth="1" />
        <line x1="2" y1="6.5" x2="5" y2="6.5" stroke="#A8A7A5" strokeWidth="1" />
        {/* Outer-corner shading */}
        <rect width="1" height="1" fill="#A8A7A5" />
        <rect y="15" width="1" height="1" fill="#A8A7A5" />
        <rect x="19" y="15" width="1" height="1" fill="#A8A7A5" />
        <rect x="19" width="1" height="1" fill="#A8A7A5" />
        {/* Inner-corner highlights */}
        <rect x="18" y="1" width="1" height="1" fill="#D9D9D9" />
        <rect x="1" y="1" width="1" height="1" fill="#D9D9D9" />
        <rect x="1" y="14" width="1" height="1" fill="#D9D9D9" />
        <rect x="18" y="14" width="1" height="1" fill="#D9D9D9" />
      </g>
    ),
  },
  "sidebar-collapsed": {
    viewBox: "0 0 20 16",
    crisp: true,
    body: (
      <g clipPath="url(#icon-sidebar-collapsed)">
        {/* Outer frame */}
        <rect x="1" width="18" height="1" fill="#333333" />
        <rect x="1" y="15" width="18" height="1" fill="#333333" />
        <rect x="20" y="1" width="14" height="1" transform="rotate(90 20 1)" fill="#333333" />
        <rect x="1" y="1" width="14" height="1" transform="rotate(90 1 1)" fill="#333333" />
        {/* Narrow sidebar strip divider */}
        <rect x="4" width="16" height="1" transform="rotate(90 4 0)" fill="#333333" />
        {/* Outer-corner shading */}
        <rect width="1" height="1" fill="#A8A7A5" />
        <rect y="15" width="1" height="1" fill="#A8A7A5" />
        <rect x="19" y="15" width="1" height="1" fill="#A8A7A5" />
        <rect x="19" width="1" height="1" fill="#A8A7A5" />
        {/* Inner-corner highlights */}
        <rect x="18" y="1" width="1" height="1" fill="#D9D9D9" />
        <rect x="18" y="14" width="1" height="1" fill="#D9D9D9" />
        <rect x="1" y="14" width="1" height="1" fill="#D9D9D9" />
        <rect x="1" y="1" width="1" height="1" fill="#D9D9D9" />
      </g>
    ),
  },
};

/** Clip-path defs keyed by icon name — only the pixel-art sidebar icons
 *  need one. Rendered alongside `body` when present. */
const CLIP_DEFS: Partial<Record<IconName, ReactNode>> = {
  "sidebar-expanded": (
    <clipPath id="icon-sidebar-expanded">
      <rect width="20" height="16" fill="white" />
    </clipPath>
  ),
  "sidebar-collapsed": (
    <clipPath id="icon-sidebar-collapsed">
      <rect width="20" height="16" fill="white" />
    </clipPath>
  ),
};

interface IconProps {
  name: IconName;
  /** Icon color — drives both stroke and fill. Defaults to `currentColor`
   *  (inherits text color / honors any CSS class on the icon). Has no
   *  effect on fixed-art icons (`google`, `sidebar-*`). */
  color?: string;
  /** Outline width for vector icons. Default 1.5. */
  stroke?: number;
  /** Rendered size in px — a number for square, or explicit dimensions.
   *  Default 24×24. */
  size?: number | { width: number; height: number };
  className?: string;
  style?: CSSProperties;
  /** Accessible label. When set the icon is exposed to assistive tech;
   *  otherwise it is `aria-hidden` (decorative). */
  title?: string;
}

export function Icon({
  name,
  color,
  stroke = 1.5,
  size = 24,
  className,
  style,
  title,
}: IconProps) {
  const def = ICONS[name];
  const width = typeof size === "number" ? size : size.width;
  const height = typeof size === "number" ? size : size.height;
  const a11y = title
    ? { role: "img" as const, "aria-label": title }
    : { "aria-hidden": true };

  if ("src" in def) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static icon asset
      <img
        src={def.src}
        alt={title ?? ""}
        width={width}
        height={height}
        className={className}
        style={style}
      />
    );
  }

  const clip = CLIP_DEFS[name];

  return (
    <svg
      width={width}
      height={height}
      viewBox={def.viewBox}
      fill="none"
      stroke="none"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      shapeRendering={def.crisp ? "crispEdges" : undefined}
      className={className}
      style={color ? { color, ...style } : style}
      {...a11y}
    >
      {clip && <defs>{clip}</defs>}
      {def.body}
    </svg>
  );
}
