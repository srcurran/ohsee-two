import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { readJsonFile, writeJsonFile } from "@/lib/data";
import { userProjectsFile } from "@/lib/constants";
import { requireUserId } from "@/lib/auth-helpers";
import type { Project } from "@/lib/types";

export async function GET() {
  try {
    const userId = await requireUserId();
    const projects = await readJsonFile<Project[]>(userProjectsFile(userId), []);
    return NextResponse.json(projects);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const { prodUrl, devUrl, pages } = body as {
      prodUrl: string;
      devUrl: string;
      pages?: { path: string }[];
    };

    const project: Project = {
      id: uuidv4(),
      prodUrl,
      devUrl,
      pages: (pages || [{ path: "/" }]).map((p) => ({
        id: uuidv4(),
        path: p.path,
      })),
      createdAt: new Date().toISOString(),
      lastDiffAt: null,
    };

    const projects = await readJsonFile<Project[]>(userProjectsFile(userId), []);
    projects.push(project);
    await writeJsonFile(userProjectsFile(userId), projects);

    return NextResponse.json(project, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
