interface Props {
  count: number;
  /** Changes shared across all breakpoints. */
  universalCount?: number;
  /** Changes unique to the active breakpoint. */
  specificCount?: number;
  noData?: boolean;
}

export default function ChangeBadge({
  count,
  universalCount = 0,
  specificCount = 0,
  noData,
}: Props) {
  if (noData) {
    return (
      <div className="badge badge--neutral">
        <span>&mdash;</span>
      </div>
    );
  }

  if (count === 0) {
    return (
      <div className="badge badge--success">
        <span>0</span>
      </div>
    );
  }

  // When we have a universal/specific split, render two badges side-by-side.
  // Universal = outline (white bg, red text, red border)
  // Specific  = filled  (red bg, white text) — existing warning style
  const hasSplit = universalCount > 0 || specificCount > 0;

  if (hasSplit && (universalCount + specificCount) > 0) {
    return (
      <div className="badge-pair">
        {universalCount > 0 && (
          <div className="badge badge--warning-outline">
            <span>{universalCount > 50 ? "50+" : universalCount}</span>
          </div>
        )}
        {specificCount > 0 && (
          <div className="badge badge--warning">
            <span>{specificCount > 50 ? "50+" : specificCount}</span>
          </div>
        )}
      </div>
    );
  }

  // Fallback: single badge (no split data)
  const label = count > 50 ? "50+" : String(count);
  return (
    <div className="badge badge--warning">
      <span>{label}</span>
    </div>
  );
}
