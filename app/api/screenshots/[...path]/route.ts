import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { userDir } from "@/lib/constants";
import { requireUserId } from "@/lib/auth-helpers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const userId = await requireUserId();
    const { path: segments } = await params;
    const userDataDir = userDir(userId);
    const filePath = path.join(userDataDir, ...segments);

    // Prevent path traversal — file must be within the user's directory
    if (!filePath.startsWith(userDataDir)) {
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
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
