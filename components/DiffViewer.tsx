interface Props {
  src: string;
  alt?: string;
}

export default function DiffViewer({ src, alt = "Diff view" }: Props) {
  return (
    <div>
      <p className="mb-[8px] text-[14px] text-black">Changes</p>
      <div className="overflow-auto border border-border-primary">
        <img src={src} alt={alt} className="w-full" />
      </div>
    </div>
  );
}
