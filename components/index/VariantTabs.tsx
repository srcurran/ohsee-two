"use client";

interface Props {
  variants: string[];
  active: string | null;
  onChange: (variantId: string | null) => void;
}

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
    <div className="variant-tabs">
      <span className="variant-tabs__label">Variant</span>
      {options.map((opt) => {
        const isActive = active === opt.id;
        return (
          <button
            key={opt.id ?? "default"}
            onClick={() => onChange(opt.id)}
            className={`variant-tab ${isActive ? "variant-tab--active" : ""}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
