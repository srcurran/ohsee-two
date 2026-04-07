"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";

export default function AccountSettingsPage() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const user = session?.user;

  useEffect(() => setMounted(true), []);

  return (
    <div>
      <h1 className="mb-[32px] text-[24px] font-bold text-foreground">Account</h1>

      {/* Profile */}
      <section className="mb-[32px]">
        <div className="flex items-center gap-[16px]">
          {user?.image ? (
            <img
              src={user.image}
              alt={user.name || "User"}
              width={48}
              height={48}
              className="rounded-full"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="flex h-[48px] w-[48px] items-center justify-center rounded-full bg-accent-yellow text-[18px] font-bold text-foreground">
              {user?.name?.charAt(0).toUpperCase() || "?"}
            </span>
          )}
          <div>
            <p className="text-[16px] font-bold text-foreground">{user?.name}</p>
            <p className="text-[14px] text-text-muted">{user?.email}</p>
          </div>
        </div>
      </section>

      {/* Theme */}
      {mounted && (
        <section className="mb-[32px]">
          <p className="mb-[8px] text-[14px] text-foreground">Theme</p>
          <div className="flex w-fit rounded-[8px] bg-surface-tertiary p-[3px]">
            {(["light", "dark", "system"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setTheme(opt)}
                className={`rounded-[6px] px-[16px] py-[6px] text-[14px] capitalize transition-colors ${
                  theme === opt
                    ? "bg-surface-content font-bold shadow-sm"
                    : "text-text-muted hover:text-foreground"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Sign out */}
      <section>
        <button
          onClick={() => signOut({ callbackUrl: "/sign-in" })}
          className="rounded-[8px] px-[16px] py-[8px] text-[14px] text-text-muted transition-colors hover:bg-surface-tertiary hover:text-foreground"
        >
          Sign out
        </button>
      </section>
    </div>
  );
}
