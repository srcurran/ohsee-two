"use client";

import { SessionProvider } from "next-auth/react";
import SidebarProvider from "@/components/SidebarProvider";
import Sidebar from "@/components/Sidebar";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <div className="flex h-screen overflow-hidden">
        <SidebarProvider>
          <Sidebar />
          <main className="min-w-0 flex-1 py-[12px] pr-[12px]">
            <div className="h-full overflow-x-hidden overflow-y-auto rounded-[12px] bg-surface-content shadow-elevation-content">
              {children}
            </div>
          </main>
        </SidebarProvider>
      </div>
    </SessionProvider>
  );
}
