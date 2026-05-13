"use client";

import { useState } from "react";

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function isLocalhost(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname.startsWith("192.168.");
  } catch {
    return false;
  }
}

function domainHue(domain: string): number {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash % 360);
}

interface SidebarFaviconProps {
  url: string;
  fallbackUrl?: string;
  size?: number;
}

/**
 * Bare favicon image for the sidebar — no background wrapper, no padding.
 * Falls back to a colored letter circle.
 */
export default function SidebarFavicon({
  url,
  fallbackUrl,
  size = 32,
}: SidebarFaviconProps) {
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
  const initial = domain.charAt(0).toUpperCase();
  const hue = domainHue(domain);

  if (failed || urls.length === 0) {
    return (
      <span
        className="sidebar-favicon__fallback"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.4,
          backgroundColor: `hsl(${hue}, 50%, 65%)`,
        }}
      >
        {initial}
      </span>
    );
  }

  const activeHostname = getHostname(urls[attemptIndex] || urls[0]);

  return (
    <img
      src={`/api/favicon?domain=${activeHostname}`}
      alt={domain}
      width={size}
      height={size}
      className="sidebar-favicon"
      onError={() => {
        if (attemptIndex < urls.length - 1) {
          setAttemptIndex(attemptIndex + 1);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}
