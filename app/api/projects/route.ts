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
    const { prodUrl, devUrl, pages, requiresAuth, variants, flows } = body as {
      prodUrl: string;
      devUrl: string;
      pages?: { path: string }[];
      requiresAuth?: boolean;
      variants?: { id: string; label: string; colorScheme?: "light" | "dark"; initScript?: string }[];
      flows?: Project["flows"];
    };

    const now = new Date().toISOString();
    const pageEntries = (pages || [{ path: "/" }]).map((p) => ({
      id: uuidv4(),
      path: p.path,
    }));
    const flowEntries = flows && flows.length > 0 ? flows : [];

    const project: Project = {
      id: uuidv4(),
      prodUrl,
      devUrl,
      pages: pageEntries,
      createdAt: now,
      lastDiffAt: null,
      ...(requiresAuth ? { requiresAuth } : {}),
      ...(variants && variants.length > 0 ? { variants } : {}),
      ...(flowEntries.length > 0 ? { flows: flowEntries } : {}),
      tests: [
        {
          id: uuidv4(),
          name: "Default",
          pages: pageEntries,
          flows: flowEntries,
          createdAt: now,
          lastRunAt: null,
        },
      ],
    };

    const projects = await readProjectsWithMigration(userId);
    projects.push(project);
    await writeJsonFile(userProjectsFile(userId), projects);

    return NextResponse.json(project, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
