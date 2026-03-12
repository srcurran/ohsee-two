import { NextResponse } from "next/server";
import { readJsonFile, writeJsonFile } from "@/lib/data";
import { userProjectsFile } from "@/lib/constants";
import { requireUserId } from "@/lib/auth-helpers";
import type { Project } from "@/lib/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const projects = await readJsonFile<Project[]>(userProjectsFile(userId), []);
    const project = projects.find((p) => p.id === id);
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(project);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = await request.json();
    const projects = await readJsonFile<Project[]>(userProjectsFile(userId), []);
    const index = projects.findIndex((p) => p.id === id);
    if (index === -1) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    projects[index] = { ...projects[index], ...body };
    await writeJsonFile(userProjectsFile(userId), projects);
    return NextResponse.json(projects[index]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const projects = await readJsonFile<Project[]>(userProjectsFile(userId), []);
    const filtered = projects.filter((p) => p.id !== id);
    await writeJsonFile(userProjectsFile(userId), filtered);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
