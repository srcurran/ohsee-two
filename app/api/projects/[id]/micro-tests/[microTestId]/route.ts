import { NextResponse } from "next/server";
import { writeJsonFile } from "@/lib/data";
import { userProjectsFile } from "@/lib/constants";
import { requireUserId } from "@/lib/auth-helpers";
import { readProjectsWithMigration } from "@/lib/site-test-migration";

type Params = { id: string; microTestId: string };

/**
 * GET /api/projects/[id]/micro-tests/[microTestId]
 * Get a single micro-test.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<Params> },
) {
  try {
    const userId = await requireUserId();
    const { id, microTestId } = await params;
    const projects = await readProjectsWithMigration(userId);
    const project = projects.find((p) => p.id === id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const microTest = project.microTests?.find((mt) => mt.id === microTestId);
    if (!microTest) {
      return NextResponse.json({ error: "Micro-test not found" }, { status: 404 });
    }

    return NextResponse.json(microTest);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/**
 * PUT /api/projects/[id]/micro-tests/[microTestId]
 * Update a micro-test.
 * Body: Partial<{ name, displayName, script }>
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<Params> },
) {
  try {
    const userId = await requireUserId();
    const { id, microTestId } = await params;
    const body = await request.json();

    const projects = await readProjectsWithMigration(userId);
    const projectIndex = projects.findIndex((p) => p.id === id);
    if (projectIndex === -1) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const project = projects[projectIndex];
    const mtIndex = project.microTests?.findIndex((mt) => mt.id === microTestId) ?? -1;
    if (mtIndex === -1 || !project.microTests) {
      return NextResponse.json({ error: "Micro-test not found" }, { status: 404 });
    }

    project.microTests[mtIndex] = {
      ...project.microTests[mtIndex],
      ...(body.name !== undefined && { name: body.name }),
      ...(body.displayName !== undefined && { displayName: body.displayName }),
      ...(body.script !== undefined && { script: body.script }),
      updatedAt: new Date().toISOString(),
    };

    await writeJsonFile(userProjectsFile(userId), projects);
    return NextResponse.json(project.microTests[mtIndex]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/**
 * DELETE /api/projects/[id]/micro-tests/[microTestId]
 * Delete a micro-test.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<Params> },
) {
  try {
    const userId = await requireUserId();
    const { id, microTestId } = await params;

    const projects = await readProjectsWithMigration(userId);
    const projectIndex = projects.findIndex((p) => p.id === id);
    if (projectIndex === -1) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const project = projects[projectIndex];
    project.microTests = (project.microTests ?? []).filter((mt) => mt.id !== microTestId);
    await writeJsonFile(userProjectsFile(userId), projects);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
