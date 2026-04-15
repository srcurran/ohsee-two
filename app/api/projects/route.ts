import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { writeJsonFile } from "@/lib/data";
import { userProjectsFile } from "@/lib/constants";
import { requireUserId } from "@/lib/auth-helpers";
import { readProjectsWithMigration } from "@/lib/site-test-migration";
import type { Project } from "@/lib/types";

export async function GET() {
  try {
    const userId = await requireUserId();
    const projects = await readProjectsWithMigration(userId);
    return NextResponse.json(projects);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const { name, prodUrl, devUrl, requiresAuth, variants, breakpoints } = body as {
      name?: string;
      prodUrl: string;
      devUrl: string;
      requiresAuth?: boolean;
      variants?: { id: string; label: string; colorScheme?: "light" | "dark"; initScript?: string }[];
      breakpoints?: number[];
    };

    const now = new Date().toISOString();

    const project: Project = {
      id: uuidv4(),
      ...(name ? { name } : {}),
      prodUrl,
      devUrl,
      pages: [],
      createdAt: now,
      lastDiffAt: null,
      ...(requiresAuth ? { requiresAuth } : {}),
      ...(variants && variants.length > 0 ? { variants } : {}),
      ...(breakpoints ? { breakpoints } : {}),
      tests: [],
    };

    const projects = await readProjectsWithMigration(userId);
    projects.push(project);
    await writeJsonFile(userProjectsFile(userId), projects);

    return NextResponse.json(project, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
