import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "text" | "icon";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "btn btn--primary",
  secondary: "btn btn--secondary",
  outline: "btn btn--outline",
  ghost: "btn btn--ghost",
  danger: "btn btn--danger",
  text: "btn btn--text",
  icon: "icon-btn icon-btn--lg",
};

export default function Button({ variant = "primary", className = "", children, ...props }: Props) {
  const base = VARIANT_CLASS[variant];
  return (
    <button className={className ? `${base} ${className}` : base} {...props}>
      {children}
    </button>
  );
}
