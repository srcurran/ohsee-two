"use client";

import { useState } from "react";

function ensureProtocol(url: string): string {
  if (!/^https?:\/\//i.test(url)) return `https://${url}`;
  return url;
}

function getHostname(url: string): string {
  try {
    return new URL(ensureProtocol(url)).hostname;
  } catch {
    return url;
  }
}

function getDomain(url: string): string {
  try {
    return new URL(ensureProtocol(url)).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function isLocalhost(url: string): boolean {
  try {
    const hostname = new URL(ensureProtocol(url)).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname.startsWith("192.168.");
  } catch {
    return false;
  }
}

/** Hash a string to a consistent hue for fallback colors */
function domainHue(domain: string): number {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash % 360);
}

interface ProjectFaviconProps {
  /** Primary URL to try for favicon */
  url: string;
  /** Secondary URL to try if primary fails */
  fallbackUrl?: string;
  /** Total outer size including padding */
  size?: number;
  /** Border radius of the favicon tile in px. Defaults to 8. */
  borderRadius?: number;
  className?: string;
}

/**
 * Displays a project favicon on a soft rounded background.
 * The icon is inset with padding so rounding doesn't clip content.
 * Tries non-localhost URLs first since localhost rarely has a favicon.
 * Falls back to a colored letter badge.
 */
export default function ProjectFavicon({
  url,
  fallbackUrl,
  size = 56,
  borderRadius = 8,
  className,
}: ProjectFaviconProps) {
  // Order URLs: try non-localhost first
  const urls = [url, fallbackUrl].filter(Boolean) as string[];
  urls.sort((a, b) => {
    const aLocal = isLocalhost(a);
    const bLocal = isLocalhost(b);
    if (aLocal && !bLocal) return 1;
    if (!aLocal && bLocal) return -1;
    return 0;
  });

  const [attemptIndex, setAttemptIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  // Use the first non-localhost URL for display name/fallback letter
  const displayUrl = urls.find((u) => !isLocalhost(u)) || urls[0] || url;
  const domain = getDomain(displayUrl);
  const initial = domain.charAt(0).toUpperCase();
  const hue = domainHue(domain);

  const allLocalhost = urls.length > 0 && urls.every(isLocalhost);

  if (failed || urls.length === 0 || allLocalhost) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center text-text-muted ${className || ""}`}
        style={{ width: size, height: size }}
      >
        <svg
          width={size * 0.65}
          height={size * 0.65}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      </span>
    );
  }

  const activeHostname = getHostname(urls[attemptIndex] || urls[0]);

  return (
    <span
      className={`flex shrink-0 items-center justify-center ${className || ""}`}
      style={{ width: size, height: size }}
    >
      <span
        className="flex h-full w-full items-center justify-center overflow-hidden"
        style={{ borderRadius }}
      >
        <img
          src={`/api/favicon?domain=${activeHostname}`}
          alt={domain}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => {
            if (attemptIndex < urls.length - 1) {
              setAttemptIndex(attemptIndex + 1);
            } else {
              setFailed(true);
            }
          }}
        />
      </span>
    </span>
  );
}
