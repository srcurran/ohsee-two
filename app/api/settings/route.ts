import { NextResponse } from "next/server";
import { readJsonFile, writeJsonFile } from "@/lib/data";
import { userSettingsFile, BREAKPOINTS } from "@/lib/constants";
import { requireUserId } from "@/lib/auth-helpers";
import type { UserSettings } from "@/lib/types";

const DEFAULT_SETTINGS: UserSettings = {
  defaultBreakpoints: [...BREAKPOINTS],
};

export async function GET() {
  try {
    const userId = await requireUserId();
    const settings = await readJsonFile<UserSettings>(
      userSettingsFile(userId),
      DEFAULT_SETTINGS
    );
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const current = await readJsonFile<UserSettings>(
      userSettingsFile(userId),
      DEFAULT_SETTINGS
    );
    const updated: UserSettings = { ...current, ...body };
    await writeJsonFile(userSettingsFile(userId), updated);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
