import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { writeJsonFile } from "@/lib/data";
import { userProjectsFile } from "@/lib/constants";
import { requireUserId } from "@/lib/auth-helpers";
import { readProjectsWithMigration } from "@/lib/site-test-migration";
import type { SiteTest } from "@/lib/types";

/** GET /api/projects/[id]/tests — list all tests for a project */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const projects = await readProjectsWithMigration(userId);
    const project = projects.find((p) => p.id === id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json(project.tests || []);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/** POST /api/projects/[id]/tests — create a new test */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = await request.json();
    const { name, pages, flows } = body as {
      name: string;
      pages?: { path: string }[];
      flows?: SiteTest["flows"];
    };

    const projects = await readProjectsWithMigration(userId);
    const project = projects.find((p) => p.id === id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const test: SiteTest = {
      id: uuidv4(),
      name: name || "Untitled Test",
      pages: (pages || []).map((p) => ({
        id: uuidv4(),
        path: p.path,
      })),
      flows: flows || [],
      createdAt: new Date().toISOString(),
      lastRunAt: null,
    };

    if (!project.tests) project.tests = [];
    project.tests.push(test);
    await writeJsonFile(userProjectsFile(userId), projects);

    return NextResponse.json(test, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
