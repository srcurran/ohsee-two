"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Field, { type FieldStatus } from "@/components/utility/Field";
import { useSidebar } from "@/components/utility/SidebarProvider";
import { checkUrl } from "@/lib/url-validation";
import type { Project, SiteTest } from "@/lib/types";
import { Icon } from "@/components/utility/Icon";
import AuthProfilesPanel from "@/components/settings/shared/AuthProfilesPanel";
import { Accordion } from "@/components/settings/shared/SettingsAccordion";
import { useMediaQuery } from "@/components/utility/use/useMediaQuery";

type ProjSectionId = "general" | "auth" | "danger";

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
  // Narrow: stacked accordions. Tablet+: left-rail nav. One section list.
  const wide = useMediaQuery("(min-width: 768px)");
  const [openAccordion, setOpenAccordion] = useState<ProjSectionId | null>("general");
  const [activeSection, setActiveSection] = useState<ProjSectionId>("general");

  const [name, setName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [prodUrl, setProdUrl] = useState("");
  const [devUrl, setDevUrl] = useState("");

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
  const prodStatus: FieldStatus = !prodUrl ? "idle" : prodCheck.ok ? "valid" : "invalid";
  const devStatus: FieldStatus = !devUrl ? "idle" : devCheck.ok ? "valid" : "invalid";

  const archivedTests: SiteTest[] = (project?.tests || []).filter((t) => t.archived);

  // Section list — rail+pane on tablet+, accordions on narrow.
  const sections: { id: ProjSectionId; label: string; content: ReactNode }[] = [
    {
      id: "general",
      label: "General",
      content: (
        <>
          <Field
            label="Prod URL"
            value={prodUrl}
            onChange={(e) => onProdChange(e.target.value)}
            onBlur={flushSave}
            status={prodStatus}
            error={prodStatus === "invalid" ? (prodCheck.ok ? null : prodCheck.reason) : null}
            placeholder="https://example.com"
            spellCheck={false}
          />
          <Field
            label="Dev URL"
            value={devUrl}
            onChange={(e) => onDevChange(e.target.value)}
            onBlur={flushSave}
            status={devStatus}
            error={devStatus === "invalid" ? (devCheck.ok ? null : devCheck.reason) : null}
            placeholder="http://localhost:3000"
            spellCheck={false}
          />
        </>
      ),
    },
    {
      id: "auth",
      label: "Sign-in profiles",
      content: <AuthProfilesPanel projectId={projectId} />,
    },
    {
      id: "danger",
      label: "Danger Zone",
      content: project ? (
        <div className="settings-overlay__danger-body">
          <section className="settings-overlay__danger-section stack stack--xs">
            <h3 className="settings-overlay__danger-heading">
              {project.archived ? "Unarchive project" : "Archive project"}
            </h3>
            <p className="settings-overlay__danger-copy">
              {project.archived
                ? "Restore this project to the sidebar."
                : "Hide this project from the sidebar. Reports are preserved."}
            </p>
            <button type="button" className="btn btn--outline" onClick={handleArchiveProject}>
              {project.archived ? "Unarchive" : "Archive"}
            </button>
          </section>

          <section className="settings-overlay__danger-section stack stack--xs">
            <h3 className="settings-overlay__danger-heading">Archived tests</h3>
            <p className="settings-overlay__danger-copy">
              This is where archived tests can be restored.
            </p>
            {archivedTests.length === 0 ? (
              <p className="empty-note">No archived tests.</p>
            ) : (
              <ul className="settings-overlay__archived-list">
                {archivedTests.map((t) => (
                  <li key={t.id} className="settings-overlay__archived-row">
                    <span className="settings-overlay__archived-name">{t.name}</span>
                    <div className="settings-overlay__archived-actions row row--lg">
                      <button
                        type="button"
                        className="settings-overlay__link-action"
                        onClick={() => handleUnarchiveTest(t.id)}
                      >
                        un-archive
                      </button>
                      {pendingDeleteId === t.id ? (
                        <>
                          <button
                            type="button"
                            className="settings-overlay__link-action settings-overlay__link-action--danger"
                            onClick={() => handleDeleteTest(t.id)}
                          >
                            confirm delete
                          </button>
                          <button
                            type="button"
                            className="settings-overlay__link-action"
                            onClick={() => setPendingDeleteId(null)}
                          >
                            cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="settings-overlay__link-action"
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
      ) : null,
    },
  ];

  return (
    <div
      className={`settings-overlay settings-overlay--${animState}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      style={{ transitionDuration: animState === "exiting" ? `${EXIT_MS}ms` : `${ENTER_MS}ms` }}
    >
      <div
        className="settings-overlay__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-settings-title"
      >
        <header className="settings-overlay__header row row--between">
          {editingName ? (
            <input
              autoFocus
              className="settings-overlay__title-input"
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
              className="settings-overlay__title-button"
              onClick={() => setEditingName(true)}
              title="Click to rename"
            >
              <span id="project-settings-title" className="settings-overlay__title">
                {name || (project ? getDomain(project.prodUrl) : "Project")}
              </span>
              <Icon name="edit" size={16} className="settings-overlay__title-icon" />
            </button>
          )}
          <button
            type="button"
            className="icon-btn settings-overlay__close"
            onClick={handleClose}
            title="Close"
          >
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="settings-overlay__body">
          {wide ? (
            <div className="settings-nav">
              <nav className="settings-nav__rail">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`settings-nav__item${activeSection === s.id ? " settings-nav__item--active" : ""}`}
                    onClick={() => setActiveSection(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </nav>
              <div className="settings-nav__pane">
                {(sections.find((s) => s.id === activeSection) ?? sections[0])?.content}
              </div>
            </div>
          ) : (
            <div className="settings-accordion-group">
              {sections.map((s) => (
                <Accordion
                  key={s.id}
                  title={s.label}
                  open={openAccordion === s.id}
                  onToggle={() => setOpenAccordion((cur) => (cur === s.id ? null : s.id))}
                >
                  {s.content}
                </Accordion>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
