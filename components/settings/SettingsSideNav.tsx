"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/utility/Icon";

export interface NavSection {
  label: string;
  href: string;
}

interface Props {
  title: string;
  sections: NavSection[];
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
}

export default function SettingsSideNav({
  title,
  sections,
  backHref,
  backLabel,
  children,
}: Props) {
  const pathname = usePathname();

  return (
    <div className="settings-shell">
      <nav className="sidenav">
        {backHref && (
          <Link href={backHref} className="sidenav__back">
            <Icon name="arrow-left" size={14} />
            {backLabel || "Back"}
          </Link>
        )}
        <h2 className="sidenav__title animate-card-in">{title}</h2>
        <div className="sidenav__list">
          {sections.map((section, i) => {
            const isActive = pathname === section.href;
            return (
              <Link
                key={section.href}
                href={section.href}
                className={`sidenav__item animate-card-in ${isActive ? "sidenav__item--active" : ""}`}
                style={{ animationDelay: `${(i + 1) * 30}ms` }}
              >
                {section.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="settings-shell__content">
        <div className="settings-shell__inner">{children}</div>
      </div>
    </div>
  );
}
