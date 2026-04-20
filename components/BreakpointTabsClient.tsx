"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import BreakpointTabs from "./BreakpointTabs";

function BreakpointTabsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bp = Number(searchParams.get("bp")) || 1920;

  const handleChange = (newBp: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("bp", String(newBp));
    router.push(`?${params.toString()}`, { scroll: false });
  };

  return <BreakpointTabs active={bp} onChange={handleChange} />;
}

export default function BreakpointTabsClient() {
  return (
    <Suspense fallback={<div className="tab-bar" style={{ height: 58 }} />}>
      <BreakpointTabsInner />
    </Suspense>
  );
}
