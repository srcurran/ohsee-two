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
    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    if (res.ok) {
      refreshProjects();
      router.push("/");
    }
    setDeleting(false);
  };

  if (!project) {
    return (
      <div className="center" style={{ height: "100%" }}>
        <p className="loader-text">Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <p className="section-body" style={{ marginBottom: "var(--space-6)" }}>Danger zone — archive or delete this project.</p>

      <div className="stack stack--xl">
        <div className="card card--bordered">
          <h3 className="card__title">
            {project.archived ? "Unarchive Project" : "Archive Project"}
          </h3>
          <p className="card__body">
            {project.archived
              ? "Restore this project to the sidebar."
              : "Hide this project from the sidebar. Reports are preserved."}
          </p>
          <button onClick={handleArchive} className="btn btn--outline">
            {project.archived ? "Unarchive" : "Archive"}
          </button>
        </div>

        <div className="card card--danger">
          <h3 className="card__title">Delete Project</h3>
          <p className="card__body">
            Permanently remove this project and all its reports. This cannot be undone.
          </p>
          {!showDeleteConfirm ? (
            <button onClick={() => setShowDeleteConfirm(true)} className="btn btn--danger-outline">
              Delete Project
            </button>
          ) : (
            <div className="row row--sm">
              <button onClick={handleDelete} disabled={deleting} className="btn btn--danger">
                {deleting ? "Deleting..." : "Confirm Delete"}
              </button>
              <button onClick={() => setShowDeleteConfirm(false)} className="btn btn--text">
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
