export default function ChangeBadge({ count }: { count: number }) {
  const label = count > 50 ? "50+" : String(count);

  // Yellow for changes, green for zero — matches Figma tokens
  const style =
    count > 0
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
