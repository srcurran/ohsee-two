export default function ChangeBadge({ count }: { count: number }) {
  const label = count > 50 ? "50+" : String(count);

  // Yellow for changes, green for zero — matches Figma tokens
  const style =
    count > 0
      ? "bg-accent-yellow text-black"
      : "bg-accent-green text-black";

  return (
    <div
      className={`${style} inline-flex size-[24px] items-center justify-center rounded-full`}
    >
      <span className="text-[14px] font-bold leading-none">{label}</span>
    </div>
  );
}
