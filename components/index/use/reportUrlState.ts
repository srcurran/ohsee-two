/** Mirrors the report page's view state into the URL (bp / variant / page).
 * Also owns the page-detail open animation origin (so the overlay can
 * morph from the tile that launched it). Pure URL plumbing — no fetching. */

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface UseReportUrlStateResult {
  bpParam: number | null;
  activeVariant: string | null;
  activePageId: string | null;
  pageOriginRect: DOMRect | null;
  pageOriginThumb: { rect: DOMRect; src: string } | null;
  setPageOriginRect: React.Dispatch<React.SetStateAction<DOMRect | null>>;
  setPageOriginThumb: React.Dispatch<
    React.SetStateAction<{ rect: DOMRect; src: string } | null>
  >;
  handleBpChange: (bp: number) => void;
  handleVariantChange: (variantId: string | null) => void;
  openPage: (pageId: string, e?: React.MouseEvent) => void;
  closePage: () => void;
}

export function useReportUrlState(): UseReportUrlStateResult {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pageOriginRect, setPageOriginRect] = useState<DOMRect | null>(null);
  const [pageOriginThumb, setPageOriginThumb] = useState<{
    rect: DOMRect;
    src: string;
  } | null>(null);

  const bpParam = Number(searchParams.get("bp")) || null;
  const activeVariant = searchParams.get("variant") || null;
  const activePageId = searchParams.get("page") || null;

  const handleBpChange = (bp: number) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("bp", String(bp));
    router.push(`?${p.toString()}`, { scroll: false });
  };

  const openPage = (pageId: string, e?: React.MouseEvent) => {
    if (e) {
      const card = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setPageOriginRect(card);
      const img = (e.currentTarget as HTMLElement).querySelector("img");
      if (img) {
        setPageOriginThumb({ rect: img.getBoundingClientRect(), src: img.src });
      } else {
        setPageOriginThumb(null);
      }
    }
    const p = new URLSearchParams(searchParams.toString());
    p.set("page", pageId);
    router.push(`?${p.toString()}`, { scroll: false });
  };

  const closePage = () => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("page");
    router.push(`?${p.toString()}`, { scroll: false });
  };

  const handleVariantChange = (variantId: string | null) => {
    const p = new URLSearchParams(searchParams.toString());
    if (variantId) {
      p.set("variant", variantId);
    } else {
      p.delete("variant");
    }
    router.push(`?${p.toString()}`, { scroll: false });
  };

  return {
    bpParam,
    activeVariant,
    activePageId,
    pageOriginRect,
    pageOriginThumb,
    setPageOriginRect,
    setPageOriginThumb,
    handleBpChange,
    handleVariantChange,
    openPage,
    closePage,
  };
}
