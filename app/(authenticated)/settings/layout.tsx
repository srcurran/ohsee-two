"use client";

import SettingsSideNav from "@/components/settings/SettingsSideNav";

const SECTIONS = [
  { label: "Account", href: "/settings" },
  { label: "Defaults", href: "/settings/defaults" },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SettingsSideNav title="Settings" sections={SECTIONS}>
      {children}
    </SettingsSideNav>
  );
}
