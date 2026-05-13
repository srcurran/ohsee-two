interface Props {
  onClick: () => void;
  saving: boolean;
  saved: boolean;
  disabled?: boolean;
}

export default function SaveButton({ onClick, saving, saved, disabled }: Props) {
  return (
    <div className="save-row">
      <button
        onClick={onClick}
        disabled={saving || disabled}
        className="btn btn--primary"
      >
        {saving ? "Saving..." : "Save"}
      </button>
      {saved && <span className="save-feedback">Saved</span>}
    </div>
  );
}
