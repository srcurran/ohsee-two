import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { readJsonFile, writeJsonFile } from "@/lib/data";
import { PROJECTS_FILE } from "@/lib/constants";
import type { Project, PageEntry } from "@/lib/types";

export async function GET() {
  const projects = await readJsonFile<Project[]>(PROJECTS_FILE, []);
  return NextResponse.json(projects);
}

export async function POST(request: Request) {
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

  const projects = await readJsonFile<Project[]>(PROJECTS_FILE, []);
  projects.push(project);
  await writeJsonFile(PROJECTS_FILE, projects);

  return NextResponse.json(project, { status: 201 });
}
