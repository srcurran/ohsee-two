"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavSection {
  label: string;
  href: string;
}

interface Props {
  title: string;
  sections: NavSection[];
  /** Optional back link shown above the title */
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
    <div className="flex h-full">
      {/* Side nav */}
      <nav className="w-[200px] shrink-0 px-[24px] py-[24px]">
        {backHref && (
          <Link
            href={backHref}
            className="mb-[16px] flex items-center gap-[6px] text-[13px] text-text-muted transition-colors hover:text-foreground"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            {backLabel || "Back"}
          </Link>
        )}
        <h2 className="mb-[24px] text-[32px] text-foreground animate-card-in">{title}</h2>
        <div className="flex flex-col gap-[2px]">
          {sections.map((section, i) => {
            const isActive = pathname === section.href;
            return (
              <Link
                key={section.href}
                href={section.href}
                className={`animate-card-in rounded-[8px] px-[12px] py-[8px] text-[14px] transition-colors ${
                  isActive
                    ? "bg-surface-tertiary font-bold text-foreground"
                    : "text-text-muted hover:bg-surface-tertiary hover:text-foreground"
                }`}
                style={{ animationDelay: `${(i + 1) * 30}ms` }}
              >
                {section.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-[32px] py-[24px]">
        <div className="max-w-[560px]">{children}</div>
      </div>
    </div>
  );
}
