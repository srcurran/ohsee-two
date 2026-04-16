import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "text" | "icon";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "rounded-[12px] bg-foreground px-[32px] py-[10px] text-[16px] font-bold text-surface-content transition-all hover:shadow-elevation-md hover:-translate-y-[1px] disabled:opacity-50",
  secondary:
    "rounded-[8px] bg-surface-tertiary px-[16px] py-[8px] text-[14px] text-foreground transition-colors hover:bg-foreground/10",
  outline:
    "rounded-[8px] border border-border-strong px-[24px] py-[10px] text-foreground transition-all hover:bg-surface-tertiary hover:shadow-elevation-md hover:-translate-y-[1px]",
  ghost:
    "rounded-[8px] px-[16px] py-[8px] text-[14px] text-text-muted transition-colors hover:bg-surface-tertiary",
  danger:
    "rounded-[8px] bg-status-error px-[16px] py-[6px] text-[14px] font-bold text-white transition-colors hover:opacity-90",
  text:
    "text-[13px] text-text-muted transition-colors hover:text-foreground",
  icon:
    "flex h-[40px] w-[40px] items-center justify-center rounded-[10px] text-text-subtle transition-colors hover:bg-foreground/[0.05]",
};

export default function Button({ variant = "primary", className = "", children, ...props }: Props) {
  return (
    <button className={`${VARIANT_CLASSES[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
