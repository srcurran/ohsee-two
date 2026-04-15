import { NextResponse } from "next/server";
import { writeJsonFile } from "@/lib/data";
import { userProjectsFile } from "@/lib/constants";
import { requireUserId } from "@/lib/auth-helpers";
import { readProjectsWithMigration } from "@/lib/site-test-migration";
import type { MicroTest } from "@/lib/types";
import { randomUUID } from "crypto";

/**
 * GET /api/projects/[id]/micro-tests
 * List all micro-tests for a project.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const projects = await readProjectsWithMigration(userId);
    const project = projects.find((p) => p.id === id);
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(project.microTests ?? []);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/**
 * POST /api/projects/[id]/micro-tests
 * Create a new micro-test.
 * Body: { name, displayName, script }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = await request.json();

    if (!body.name || !body.displayName || typeof body.script !== "string") {
      return NextResponse.json(
        { error: "name, displayName, and script are required" },
        { status: 400 },
      );
    }

    const projects = await readProjectsWithMigration(userId);
    const index = projects.findIndex((p) => p.id === id);
    if (index === -1) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const microTest: MicroTest = {
      id: randomUUID(),
      name: body.name,
      displayName: body.displayName,
      script: body.script,
      createdAt: now,
      updatedAt: now,
    };

    const project = projects[index];
    project.microTests = [...(project.microTests ?? []), microTest];
    await writeJsonFile(userProjectsFile(userId), projects);

    return NextResponse.json(microTest, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
