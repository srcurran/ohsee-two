"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";

interface SidebarContextValue {
  refreshKey: number;
  refreshProjects: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  refreshKey: 0,
  refreshProjects: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export default function SidebarProvider({ children }: { children: ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const pathname = usePathname();

  const refreshProjects = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Persist last viewed path for home-page redirect
  useEffect(() => {
    if (pathname && pathname !== "/") {
      localStorage.setItem("ohsee-last-path", pathname);
    }
  }, [pathname]);

  return (
    <SidebarContext.Provider value={{ refreshKey, refreshProjects }}>
      {children}
    </SidebarContext.Provider>
  );
}
