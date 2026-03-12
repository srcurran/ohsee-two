import { NextResponse } from "next/server";
import { crawlSitemap } from "@/lib/crawl";
import { requireUserId } from "@/lib/auth-helpers";

export async function POST(request: Request) {
  try {
    await requireUserId();
    const { url } = await request.json();
    if (!url) {
      return NextResponse.json({ error: "URL required" }, { status: 400 });
    }
    const paths = await crawlSitemap(url);
    return NextResponse.json({ paths });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
