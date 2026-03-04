export async function crawlSitemap(baseUrl: string): Promise<string[]> {
  const base = baseUrl.replace(/\/$/, "");
  const sitemapUrl = `${base}/sitemap.xml`;

  try {
    const res = await fetch(sitemapUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return ["/"];
    const xml = await res.text();

    // Extract <loc> URLs
    const locRegex = /<loc>\s*(.*?)\s*<\/loc>/g;
    const paths: string[] = [];
    let match;
    while ((match = locRegex.exec(xml)) !== null) {
      const url = match[1];
      // Check if this is a sitemap index (nested sitemap)
      if (url.endsWith(".xml")) {
        const nestedPaths = await crawlSitemap(url.replace(/\/sitemap.*\.xml$/, ""));
        paths.push(...nestedPaths);
      } else {
        try {
          const parsed = new URL(url);
          paths.push(parsed.pathname || "/");
        } catch {
          paths.push(url);
        }
      }
    }

    return paths.length > 0 ? [...new Set(paths)] : ["/"];
  } catch {
    return ["/"];
  }
}
