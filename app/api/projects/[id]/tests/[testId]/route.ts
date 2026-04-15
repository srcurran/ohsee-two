import { NextResponse } from "next/server";
import { writeJsonFile } from "@/lib/data";
import { userProjectsFile } from "@/lib/constants";
import { requireUserId } from "@/lib/auth-helpers";
import { readProjectsWithMigration } from "@/lib/site-test-migration";

/** GET /api/projects/[id]/tests/[testId] — get a single test */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; testId: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id, testId } = await params;
    const projects = await readProjectsWithMigration(userId);
    const project = projects.find((p) => p.id === id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const test = project.tests?.find((t) => t.id === testId);
    if (!test) {
      return NextResponse.json({ error: "Test not found" }, { status: 404 });
    }
    return NextResponse.json(test);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/** PUT /api/projects/[id]/tests/[testId] — update a test */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; testId: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id, testId } = await params;
    const body = await request.json();
    const projects = await readProjectsWithMigration(userId);
    const project = projects.find((p) => p.id === id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const testIndex = project.tests?.findIndex((t) => t.id === testId) ?? -1;
    if (testIndex === -1 || !project.tests) {
      return NextResponse.json({ error: "Test not found" }, { status: 404 });
    }
    project.tests[testIndex] = { ...project.tests[testIndex], ...body };
    await writeJsonFile(userProjectsFile(userId), projects);
    return NextResponse.json(project.tests[testIndex]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/** DELETE /api/projects/[id]/tests/[testId] — delete a test */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; testId: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id, testId } = await params;
    const projects = await readProjectsWithMigration(userId);
    const project = projects.find((p) => p.id === id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (!project.tests) {
      return NextResponse.json({ error: "Test not found" }, { status: 404 });
    }
    project.tests = project.tests.filter((t) => t.id !== testId);
    await writeJsonFile(userProjectsFile(userId), projects);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
