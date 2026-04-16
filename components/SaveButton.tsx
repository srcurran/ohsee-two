interface Props {
  onClick: () => void;
  saving: boolean;
  saved: boolean;
  /** Additional condition under which the button should be disabled */
  disabled?: boolean;
}

export default function SaveButton({ onClick, saving, saved, disabled }: Props) {
  return (
    <div className="flex items-center gap-[12px]">
      <button
        onClick={onClick}
        disabled={saving || disabled}
        className="rounded-[12px] bg-foreground px-[32px] py-[10px] text-[16px] font-bold text-surface-content transition-all hover:shadow-elevation-md hover:-translate-y-[1px] disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save"}
      </button>
      {saved && (
        <span className="text-[14px] text-accent-green">Saved</span>
      )}
    </div>
  );
}
