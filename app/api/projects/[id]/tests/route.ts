import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { writeJsonFile } from "@/lib/data";
import { userProjectsFile } from "@/lib/constants";
import { requireUserId, handleApiError } from "@/lib/auth-helpers";
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
  } catch (err) {
    return handleApiError(err, "test");
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
    const { name, pages, flows, testType, draft } = body as {
      name: string;
      pages?: { path: string }[];
      flows?: SiteTest["flows"];
      testType?: SiteTest["testType"];
      draft?: boolean;
    };

    const projects = await readProjectsWithMigration(userId);
    const project = projects.find((p) => p.id === id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const test: SiteTest = {
      id: uuidv4(),
      name: name || "Untitled Test",
      // New tests default to simple (URL-based); the wizard flips this to
      // "advanced" if the user picks the Playwright path on the type step.
      testType: testType ?? "simple",
      // Marked as an in-progress draft until the wizard is finished, so the
      // sidebar/project page can surface a "Finish creating test" CTA.
      ...(draft ? { draft: true } : {}),
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
  } catch (err) {
    return handleApiError(err, "test");
  }
}
