import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth-helpers";

/**
 * Proxy for site favicons.
 * 1. Tries common well-known paths (apple-touch-icon, favicon.ico)
 * 2. Fetches the page HTML and parses <link rel="icon"> tags
 * 3. Returns 404 if nothing found → frontend falls back to a letter
 */
export async function GET(request: NextRequest) {
  try {
    await requireUserId();
  } catch {
    return new Response(null, { status: 401 });
  }

  const domain = request.nextUrl.searchParams.get("domain");
  if (!domain) return new Response(null, { status: 400 });

  // Phase 1: Try well-known paths
  const wellKnown = [
    `https://${domain}/apple-touch-icon.png`,
    `https://${domain}/apple-touch-icon-precomposed.png`,
    `https://${domain}/favicon.ico`,
  ];

  for (const url of wellKnown) {
    const img = await tryFetchImage(url);
    if (img) return img;
  }

  // Phase 2: Parse the site's HTML for <link> favicon tags
  try {
    const pageRes = await fetch(`https://${domain}`, {
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; OHSEE/1.0)" },
    });

    if (pageRes.ok) {
      const html = await pageRes.text();
      const iconUrls = parseFaviconLinks(html, `https://${domain}`);

      for (const url of iconUrls) {
        const img = await tryFetchImage(url);
        if (img) return img;
      }
    }
  } catch {
    // page fetch failed
  }

  return new Response(null, { status: 404 });
}

async function tryFetchImage(url: string): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(3000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; OHSEE/1.0)" },
    });

    if (res.ok) {
      const ct = res.headers.get("content-type") || "";
      if (
        ct.startsWith("image/") ||
        url.endsWith(".ico") ||
        url.endsWith(".png") ||
        url.endsWith(".svg")
      ) {
        const buffer = await res.arrayBuffer();
        // Skip tiny files — likely error pages or broken placeholders
        if (buffer.byteLength > 200) {
          return new Response(buffer, {
            headers: {
              "Content-Type": ct || "image/x-icon",
              "Cache-Control": "public, max-age=604800",
            },
          });
        }
      }
    }
  } catch {
    // timeout or network error
  }
  return null;
}

/**
 * Extract favicon URLs from HTML <link> tags.
 * Prefers apple-touch-icon > icon > shortcut icon, and larger sizes first.
 */
function parseFaviconLinks(html: string, baseUrl: string): string[] {
  const linkRegex =
    /<link[^>]+rel=["'](?:apple-touch-icon|icon|shortcut icon)["'][^>]*>/gi;
  const hrefRegex = /href=["']([^"']+)["']/i;
  const sizeRegex = /sizes=["'](\d+)x\d+["']/i;

  const matches: { url: string; priority: number; size: number }[] = [];
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const tag = match[0];
    const hrefMatch = hrefRegex.exec(tag);
    if (!hrefMatch) continue;

    let href = hrefMatch[1];
    // Resolve relative URLs
    if (href.startsWith("//")) {
      href = "https:" + href;
    } else if (href.startsWith("/")) {
      href = baseUrl + href;
    } else if (!href.startsWith("http")) {
      href = baseUrl + "/" + href;
    }

    // Priority: apple-touch-icon (3) > icon (2) > shortcut icon (1)
    const priority = tag.includes("apple-touch-icon")
      ? 3
      : tag.includes("shortcut")
        ? 1
        : 2;

    const sizeMatch = sizeRegex.exec(tag);
    const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;

    matches.push({ url: href, priority, size });
  }

  // Sort by priority desc, then size desc (prefer larger icons)
  matches.sort((a, b) => b.priority - a.priority || b.size - a.size);

  return matches.map((m) => m.url);
}
