export default function ChangeBadge({ count }: { count: number }) {
  const bg = count > 0 ? "bg-accent-yellow" : "bg-accent-green";

  return (
    <div
      className={`${bg} flex h-[24px] min-w-[24px] items-center justify-center rounded-full px-[4px]`}
    >
      <span className="text-[14px] font-bold leading-none text-black">{count}</span>
    </div>
  );
}
