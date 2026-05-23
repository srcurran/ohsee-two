interface Props {
  count: number;
  noData?: boolean;
}

/** Single filled badge with the change count for a page card. The
 *  universal-vs-viewport-specific breakdown lives in the change list /
 *  breakpoint dots — at card scale the user just wants the total. */
export default function ChangeBadge({ count, noData }: Props) {
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

  return (
    <div className="badge badge--warning">
      <span>{count > 50 ? "50+" : count}</span>
    </div>
  );
}
