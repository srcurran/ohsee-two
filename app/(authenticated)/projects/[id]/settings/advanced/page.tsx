"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSidebar } from "@/components/SidebarProvider";
import type { Project } from "@/lib/types";

export default function ProjectAdvancedSettings() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { refreshProjects } = useSidebar();
  const [project, setProject] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then((r) => r.json())
      .then(setProject);
  }, [params.id]);

  const handleArchive = async () => {
    if (!project) return;
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !project.archived }),
    });
    if (res.ok) {
      const updated = await res.json();
      setProject(updated);
      refreshProjects();
    }
  };

  const handleDelete = async () => {
    if (!project) return;
    setDeleting(true);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      refreshProjects();
      router.push("/");
    }
    setDeleting(false);
  };

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[560px]">
      <p className="mb-[24px] text-[14px] text-text-muted">Danger zone — archive or delete this project.</p>

      <div className="flex flex-col gap-[20px]">
        {/* Archive */}
        <div className="rounded-[12px] border border-border-primary p-[20px]">
          <h3 className="mb-[4px] text-[14px] font-bold text-foreground">
            {project.archived ? "Unarchive Project" : "Archive Project"}
          </h3>
          <p className="mb-[12px] text-[13px] text-text-muted">
            {project.archived
              ? "Restore this project to the sidebar."
              : "Hide this project from the sidebar. Reports are preserved."}
          </p>
          <button
            onClick={handleArchive}
            className="rounded-[8px] border border-border-strong px-[16px] py-[6px] text-[13px] text-foreground transition-colors hover:bg-surface-tertiary"
          >
            {project.archived ? "Unarchive" : "Archive"}
          </button>
        </div>

        {/* Delete */}
        <div className="rounded-[12px] border border-status-error-border p-[20px]">
          <h3 className="mb-[4px] text-[14px] font-bold text-foreground">
            Delete Project
          </h3>
          <p className="mb-[12px] text-[13px] text-text-muted">
            Permanently remove this project and all its reports. This cannot be undone.
          </p>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded-[8px] border border-status-error-border px-[16px] py-[6px] text-[13px] text-status-error transition-colors hover:bg-status-error-muted"
            >
              Delete Project
            </button>
          ) : (
            <div className="flex items-center gap-[8px]">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-[8px] bg-status-error px-[16px] py-[6px] text-[13px] font-bold text-white disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Confirm Delete"}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="text-[13px] text-text-muted hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
