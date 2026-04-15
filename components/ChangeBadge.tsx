export default function ChangeBadge({ count, noData }: { count: number; noData?: boolean }) {
  const label = noData ? "—" : count > 50 ? "50+" : String(count);

  const style = noData
    ? "bg-text-disabled/20 text-text-disabled"
    : count > 0
      ? "bg-accent-yellow text-foreground"
      : "bg-accent-green text-foreground";

  return (
    <div
      className={`${style} inline-flex min-w-[22px] items-center justify-center rounded-full px-[6px] py-[2px]`}
    >
      <span className="text-[11px] font-bold leading-none">{label}</span>
    </div>
  );
}
