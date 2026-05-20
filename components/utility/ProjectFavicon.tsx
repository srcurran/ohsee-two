"use client";

import { useState } from "react";
import { Icon } from "@/components/utility/Icon";

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

interface ProjectFaviconProps {
  /** Primary URL to try for favicon */
  url: string;
  /** Secondary URL to try if primary fails */
  fallbackUrl?: string;
  className?: string;
  /** Pixel size for the <img>. Matches SidebarFavicon's API — used as
   * width/height attributes so the browser reserves space. */
  size?: number;
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
  className,
  size = 24,
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

  const displayUrl = urls.find((u) => !isLocalhost(u)) || urls[0] || url;
  const domain = getDomain(displayUrl);

  const allLocalhost = urls.length > 0 && urls.every(isLocalhost);

  if (failed || urls.length === 0 || allLocalhost) {
    return (
      <span className={`favicon favicon--fallback ${className || ""}`}>
        <Icon name="globe" className="favicon__svg" />
      </span>
    );
  }

  const activeHostname = getHostname(urls[attemptIndex] || urls[0]);

  return (
    <span className={`favicon ${className || ""}`}>
      <span className="favicon__inner">
        <img
          src={`/api/favicon?domain=${activeHostname}`}
          alt={domain}
          className="favicon__img"
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
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
