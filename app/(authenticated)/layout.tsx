"use client";

import { SessionProvider } from "next-auth/react";
import SidebarProvider from "@/components/SidebarProvider";
import Sidebar from "@/components/Sidebar";
import SettingsOverlay from "@/components/SettingsOverlay";
import TitlebarCollapseButton from "@/components/TitlebarCollapseButton";
import PageTitleBar from "@/components/PageTitleBar";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <div className="app-shell app-shell--flat">
        <SidebarProvider>
          <TitlebarCollapseButton />
          <PageTitleBar />
          <Sidebar />
          <MainFrame>{children}</MainFrame>
          <SettingsOverlay />
        </SidebarProvider>
      </div>
    </SessionProvider>
  );
}

/** Flatter shell: main is plain white, and the inner scroll container carries
 *  no rounding/shadow/background — just overflow behavior. */
function MainFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="app-main app-main--flat">
      <div className="app-main__scroll">{children}</div>
    </main>
  );
}
