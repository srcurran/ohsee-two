import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "@/lib/constants";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const filePath = path.join(DATA_DIR, ...segments);

  // Prevent path traversal
  if (!filePath.startsWith(DATA_DIR)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const buffer = await fs.readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
