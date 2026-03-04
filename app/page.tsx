"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Project } from "@/lib/types";
import NewProjectOverlay from "@/components/NewProjectOverlay";

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);

  const loadProjects = async () => {
    const res = await fetch("/api/projects");
    if (res.ok) {
      setProjects(await res.json());
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  return (
    <div className="px-[140px] py-[56px]">
      <div className="flex items-center justify-between">
        <h1 className="text-[32px] font-normal text-black">Projects</h1>
        <button
          onClick={() => setShowNewProject(true)}
          className="rounded-[12px] bg-accent-green px-[40px] py-[10px] text-[20px] font-bold text-black"
        >
          New Project
        </button>
      </div>

      <div className="mt-[40px] flex flex-col gap-[24px]">
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="flex items-center justify-between rounded-[4px] bg-surface-primary p-[16px] shadow-[0px_0px_1px_0px_rgba(0,0,0,0.05),0px_1px_1px_0px_rgba(0,0,0,0.04),0px_3px_2px_0px_rgba(0,0,0,0.03),0px_5px_2px_0px_rgba(0,0,0,0.01),0px_8px_2px_0px_rgba(0,0,0,0)]"
          >
            <div className="flex items-center gap-[40px] text-black">
              <div className="flex w-[240px] flex-col">
                <span className="text-[14px]">URL</span>
                <span className="text-[20px] font-bold">
                  {project.prodUrl.replace(/^https?:\/\//, "")}
                </span>
              </div>
              <div className="flex w-[240px] flex-col">
                <span className="text-[14px]">Last Diff</span>
                <span className="text-[20px]">
                  {project.lastDiffAt
                    ? new Date(project.lastDiffAt).toLocaleString()
                    : "Never"}
                </span>
              </div>
              <div className="flex w-[240px] flex-col">
                <span className="text-[14px]">Pages</span>
                <span className="text-[20px]">{project.pages.length}</span>
              </div>
            </div>
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        ))}

        {projects.length === 0 && (
          <p className="text-center text-[16px] text-black/50">
            No projects yet. Create one to get started.
          </p>
        )}
      </div>

      {showNewProject && (
        <NewProjectOverlay
          onClose={() => setShowNewProject(false)}
          onCreated={() => {
            setShowNewProject(false);
            loadProjects();
          }}
        />
      )}
    </div>
  );
}
