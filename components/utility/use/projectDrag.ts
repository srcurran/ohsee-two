import { useRef, useState } from "react";
import type { ProjectWithReports } from "@/components/utility/utils/sidebar";

interface UseProjectDragArgs {
  data: ProjectWithReports[];
  setData: React.Dispatch<React.SetStateAction<ProjectWithReports[]>>;
}

interface UseProjectDragResult {
  /** Attach to each draggable project group. */
  onDragStart: (
    index: number,
    e: React.DragEvent<HTMLDivElement>,
  ) => void;
  onDragEnter: (index: number) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

/** Persists the new order to /api/settings — non-archived projects only,
 * since archived ones are hidden from the rail. */
function saveProjectOrder(items: ProjectWithReports[]) {
  const order = items
    .filter(({ project }) => !project.archived)
    .map(({ project }) => project.id);
  fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectOrder: order }),
  });
}

/** Drag-and-drop reorder for sidebar project groups. Owns the drag-index
 * state, mutates `data` via the provided setter on each enter, and persists
 * the order on drop. Visual feedback (the half-opacity dragged node) is
 * applied directly to the DOM element since React doesn't expose drag image
 * styling. */
export function useProjectDrag({
  data,
  setData,
}: UseProjectDragArgs): UseProjectDragResult {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);

  const onDragStart = (
    index: number,
    e: React.DragEvent<HTMLDivElement>,
  ) => {
    setDragIndex(index);
    dragNode.current = e.currentTarget;
    e.dataTransfer.effectAllowed = "move";
    requestAnimationFrame(() => {
      if (dragNode.current) dragNode.current.style.opacity = "0.4";
    });
  };

  const onDragEnter = (index: number) => {
    if (dragIndex === null || index === dragIndex) return;
    setData((prev) => {
      const next = [...prev];
      const item = next.splice(dragIndex, 1)[0];
      next.splice(index, 0, item);
      setDragIndex(index);
      return next;
    });
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const onDragEnd = () => {
    if (dragNode.current) dragNode.current.style.opacity = "1";
    dragNode.current = null;
    setDragIndex(null);
    saveProjectOrder(data);
  };

  return { onDragStart, onDragEnter, onDragOver, onDragEnd };
}
