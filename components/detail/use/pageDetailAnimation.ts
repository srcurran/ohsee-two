/** Open/close animation state for the PageDetailPanel overlay. Owns the
 * three-phase entering → visible → exiting lifecycle and computes the inline
 * style for the panel element (originRect → fullscreen → exit blur). */

import { useCallback, useEffect, useState } from "react";
import {
  ANIM_EASE,
  ANIM_MS,
  EXIT_MS,
  PANEL,
} from "@/components/detail/utils/pageDetail";

export type AnimState = "entering" | "visible" | "exiting";

interface UsePageDetailAnimationArgs {
  originRect?: DOMRect | null;
  onClose: () => void;
}

interface UsePageDetailAnimationResult {
  animState: AnimState;
  handleClose: () => void;
  getPanelStyle: () => React.CSSProperties;
}

export function usePageDetailAnimation({
  originRect,
  onClose,
}: UsePageDetailAnimationArgs): UsePageDetailAnimationResult {
  const [animState, setAnimState] = useState<AnimState>("entering");
  const hasOrigin = !!originRect;

  useEffect(() => {
    if (hasOrigin) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimState("visible"));
      });
    } else {
      setAnimState("visible");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = useCallback(() => {
    setAnimState("exiting");
    setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  const getPanelStyle = (): React.CSSProperties => {
    const enterTransition = `top ${ANIM_MS}ms ${ANIM_EASE}, left ${ANIM_MS}ms ${ANIM_EASE}, width ${ANIM_MS}ms ${ANIM_EASE}, height ${ANIM_MS}ms ${ANIM_EASE}, border-radius ${ANIM_MS}ms ${ANIM_EASE}, opacity ${ANIM_MS}ms ${ANIM_EASE}`;

    if (animState === "entering" && originRect) {
      return {
        position: "fixed",
        top: originRect.top,
        left: originRect.left,
        width: originRect.width,
        height: originRect.height,
        borderRadius: 8,
        opacity: 1,
        transition: enterTransition,
      };
    }
    if (animState === "exiting") {
      return {
        position: "fixed",
        top: PANEL.top,
        left: PANEL.left,
        width: `calc(100vw - ${PANEL.left + PANEL.right}px)`,
        height: `calc(100vh - ${PANEL.top + PANEL.bottom}px)`,
        borderRadius: 12,
        opacity: 0,
        transform: "scale(0.90)",
        filter: "blur(8px)",
        transition: `opacity ${EXIT_MS}ms ease-in, transform ${EXIT_MS}ms ease-in, filter ${EXIT_MS}ms ease-in`,
      };
    }
    return {
      position: "fixed",
      top: PANEL.top,
      left: PANEL.left,
      width: `calc(100vw - ${PANEL.left + PANEL.right}px)`,
      height: `calc(100vh - ${PANEL.top + PANEL.bottom}px)`,
      borderRadius: 12,
      opacity: 1,
      transition: enterTransition,
    };
  };

  return { animState, handleClose, getPanelStyle };
}
