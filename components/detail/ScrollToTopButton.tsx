"use client";

import { useEffect, useState } from "react";
import { ArrowUpIcon } from "@/components/utility/icons";

/** Floating "back to top" button that appears after the user has scrolled past
 * 400px. Pure presentation + a single scroll listener. */
export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="scroll-to-top"
      aria-label="Scroll to top"
    >
      <ArrowUpIcon />
    </button>
  );
}
