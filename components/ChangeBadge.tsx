export default function ChangeBadge({ count, noData }: { count: number; noData?: boolean }) {
  const label = noData ? "—" : count > 50 ? "50+" : String(count);

  const modifier = noData
    ? "badge--neutral"
    : count > 0
      ? "badge--warning"
      : "badge--success";

  return (
    <div className={`badge ${modifier}`}>
      <span>{label}</span>
    </div>
  );
}
