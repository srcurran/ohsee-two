import { NextResponse } from "next/server";
import { crawlSitemap } from "@/lib/crawl";

export async function POST(request: Request) {
  const { url } = await request.json();
  if (!url) {
    return NextResponse.json({ error: "URL required" }, { status: 400 });
  }
  const paths = await crawlSitemap(url);
  return NextResponse.json({ paths });
}
