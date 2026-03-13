"use client";

interface Props {
  variants: string[];
  active: string | null;
  onChange: (variantId: string | null) => void;
}

/**
 * Variant selector tabs. Shows Default + variant names.
 * Returns null when there are no variants (existing reports render unchanged).
 */
export default function VariantTabs({ variants, active, onChange }: Props) {
  if (variants.length === 0) return null;

  const options: { id: string | null; label: string }[] = [
    { id: null, label: "Default" },
    ...variants.map((id) => ({
      id,
      label: id.charAt(0).toUpperCase() + id.slice(1),
    })),
  ];

  return (
    <div className="flex items-center gap-[16px] border-b border-border-primary px-[24px] py-[8px]">
      <span className="text-[12px] uppercase tracking-wider text-text-subtle">Variant</span>
      {options.map((opt) => {
        const isActive = active === opt.id;
        return (
          <button
            key={opt.id ?? "default"}
            onClick={() => onChange(opt.id)}
            className={`text-[14px] transition-colors ${
              isActive
                ? "font-bold text-foreground"
                : "text-text-muted hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
