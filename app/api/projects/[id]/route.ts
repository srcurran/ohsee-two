import { NextResponse } from "next/server";
import { readJsonFile, writeJsonFile } from "@/lib/data";
import { PROJECTS_FILE } from "@/lib/constants";
import type { Project } from "@/lib/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projects = await readJsonFile<Project[]>(PROJECTS_FILE, []);
  const project = projects.find((p) => p.id === id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const projects = await readJsonFile<Project[]>(PROJECTS_FILE, []);
  const index = projects.findIndex((p) => p.id === id);
  if (index === -1) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  projects[index] = { ...projects[index], ...body };
  await writeJsonFile(PROJECTS_FILE, projects);
  return NextResponse.json(projects[index]);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projects = await readJsonFile<Project[]>(PROJECTS_FILE, []);
  const filtered = projects.filter((p) => p.id !== id);
  await writeJsonFile(PROJECTS_FILE, filtered);
  return NextResponse.json({ ok: true });
}
