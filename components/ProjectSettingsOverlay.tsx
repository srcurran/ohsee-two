"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MaterialField, { type MaterialFieldStatus } from "@/components/MaterialField";
import { useSidebar } from "@/components/SidebarProvider";
import { checkUrl } from "@/lib/url-validation";
import type { Project, SiteTest } from "@/lib/types";

const ENTER_MS = 180;
const EXIT_MS = 140;
const SAVE_DEBOUNCE_MS = 600;

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

interface Props {
  projectId: string;
  onClose: () => void;
}

export default function ProjectSettingsOverlay({ projectId, onClose }: Props) {
  const router = useRouter();
  const { refreshProjects } = useSidebar();
  const [project, setProject] = useState<Project | null>(null);
  const [animState, setAnimState] = useState<"entering" | "visible" | "exiting">("entering");

  const [name, setName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [prodUrl, setProdUrl] = useState("");
  const [devUrl, setDevUrl] = useState("");

  const [dangerOpen, setDangerOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const stateRef = useRef({ name, prodUrl, devUrl });
  stateRef.current = { name, prodUrl, devUrl };
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mount-in animation
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setAnimState("visible")));
  }, []);

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load project
  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((p: Project) => {
        setProject(p);
        setName(p.name || "");
        setProdUrl(p.prodUrl);
        setDevUrl(p.devUrl);
      });
  }, [projectId]);

  const handleClose = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    flushSave();
    setAnimState("exiting");
    setTimeout(onClose, EXIT_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const persist = useCallback(
    async (patch: Partial<Project>) => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        refreshProjects();
      }
      return res.ok;
    },
    [projectId, refreshProjects],
  );

  const flushSave = useCallback(() => {
    const s = stateRef.current;
    const prodCheck = checkUrl(s.prodUrl);
    const devCheck = checkUrl(s.devUrl);
    // Only persist URLs when both are syntactically valid; name always saves.
    const patch: Partial<Project> = {
      name: s.name.trim() || undefined,
    };
    if (prodCheck.ok) patch.prodUrl = s.prodUrl.trim().replace(/\/$/, "");
    if (devCheck.ok) patch.devUrl = s.devUrl.trim().replace(/\/$/, "");
    persist(patch);
  }, [persist]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  }, [flushSave]);

  const onProdChange = (v: string) => {
    setProdUrl(v);
    scheduleSave();
  };
  const onDevChange = (v: string) => {
    setDevUrl(v);
    scheduleSave();
  };

  const commitName = () => {
    setEditingName(false);
    flushSave();
  };

  const handleArchiveProject = async () => {
    if (!project) return;
    const ok = await persist({ archived: !project.archived });
    if (ok && !project.archived) {
      // Archived from outside this overlay — close and return to home.
      handleClose();
      router.push("/");
    }
  };

  const handleUnarchiveTest = async (testId: string) => {
    if (!project) return;
    const tests = (project.tests || []).map((t) =>
      t.id === testId ? { ...t, archived: false } : t,
    );
    await persist({ tests });
  };

  const handleDeleteTest = async (testId: string) => {
    if (!project) return;
    const tests = (project.tests || []).filter((t) => t.id !== testId);
    await persist({ tests });
    setPendingDeleteId(null);
  };

  const prodCheck = checkUrl(prodUrl);
  const devCheck = checkUrl(devUrl);
  const prodStatus: MaterialFieldStatus = !prodUrl ? "idle" : prodCheck.ok ? "valid" : "invalid";
  const devStatus: MaterialFieldStatus = !devUrl ? "idle" : devCheck.ok ? "valid" : "invalid";

  const archivedTests: SiteTest[] = (project?.tests || []).filter((t) => t.archived);

  return (
    <div
      className={`project-settings-overlay project-settings-overlay--${animState}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      style={{ transitionDuration: animState === "exiting" ? `${EXIT_MS}ms` : `${ENTER_MS}ms` }}
    >
      <div
        className="project-settings-overlay__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-settings-title"
      >
        <header className="project-settings-overlay__header">
          {editingName ? (
            <input
              autoFocus
              className="project-settings-overlay__title-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") {
                  setName(project?.name || "");
                  setEditingName(false);
                }
              }}
              placeholder={project ? getDomain(project.prodUrl) : "Project name"}
            />
          ) : (
            <button
              type="button"
              className="project-settings-overlay__title-button"
              onClick={() => setEditingName(true)}
              title="Click to rename"
            >
              <span id="project-settings-title" className="project-settings-overlay__title">
                {name || (project ? getDomain(project.prodUrl) : "Project")}
              </span>
              <svg
                className="project-settings-overlay__title-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M16.5 4.5l3 3L8 19l-4 1 1-4L16.5 4.5z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          <button
            type="button"
            className="icon-btn project-settings-overlay__close"
            onClick={handleClose}
            title="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="project-settings-overlay__body">
          <MaterialField
            label="Prod URL"
            value={prodUrl}
            onChange={(e) => onProdChange(e.target.value)}
            onBlur={flushSave}
            status={prodStatus}
            error={prodStatus === "invalid" ? prodCheck.ok ? null : prodCheck.reason : null}
            placeholder="https://example.com"
            spellCheck={false}
          />
          <MaterialField
            label="Dev URL"
            value={devUrl}
            onChange={(e) => onDevChange(e.target.value)}
            onBlur={flushSave}
            status={devStatus}
            error={devStatus === "invalid" ? devCheck.ok ? null : devCheck.reason : null}
            placeholder="http://localhost:3000"
            spellCheck={false}
          />

          <hr className="project-settings-overlay__divider" />

          <button
            type="button"
            className="project-settings-overlay__danger-toggle"
            onClick={() => setDangerOpen((v) => !v)}
            aria-expanded={dangerOpen}
          >
            <span className="project-settings-overlay__section-title">Danger Zone</span>
            <span className="project-settings-overlay__danger-glyph" aria-hidden="true">
              {dangerOpen ? "−" : "+"}
            </span>
          </button>

          {dangerOpen && project && (
            <div className="project-settings-overlay__danger-body">
              <section className="project-settings-overlay__danger-section">
                <h3 className="project-settings-overlay__danger-heading">
                  {project.archived ? "Unarchive project" : "Archive project"}
                </h3>
                <p className="project-settings-overlay__danger-copy">
                  {project.archived
                    ? "Restore this project to the sidebar."
                    : "Hide this project from the sidebar. Reports are preserved."}
                </p>
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={handleArchiveProject}
                >
                  {project.archived ? "Unarchive" : "Archive"}
                </button>
              </section>

              <section className="project-settings-overlay__danger-section">
                <h3 className="project-settings-overlay__danger-heading">Archived tests</h3>
                <p className="project-settings-overlay__danger-copy">
                  This is where archived tests can be restored.
                </p>

                {archivedTests.length === 0 ? (
                  <p className="project-settings-overlay__empty">No archived tests.</p>
                ) : (
                  <ul className="project-settings-overlay__archived-list">
                    {archivedTests.map((t) => (
                      <li key={t.id} className="project-settings-overlay__archived-row">
                        <span className="project-settings-overlay__archived-name">{t.name}</span>
                        <div className="project-settings-overlay__archived-actions">
                          <button
                            type="button"
                            className="project-settings-overlay__link-action"
                            onClick={() => handleUnarchiveTest(t.id)}
                          >
                            un-archive
                          </button>
                          {pendingDeleteId === t.id ? (
                            <>
                              <button
                                type="button"
                                className="project-settings-overlay__link-action project-settings-overlay__link-action--danger"
                                onClick={() => handleDeleteTest(t.id)}
                              >
                                confirm delete
                              </button>
                              <button
                                type="button"
                                className="project-settings-overlay__link-action"
                                onClick={() => setPendingDeleteId(null)}
                              >
                                cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="project-settings-overlay__link-action"
                              onClick={() => setPendingDeleteId(t.id)}
                            >
                              delete
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
