import Link from "next/link";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export default function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <p className="text-[14px] text-foreground">
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <span> / </span>}
          {item.href ? (
            <Link href={item.href} className="underline">
              {item.label}
            </Link>
          ) : (
            <span>{item.label}</span>
          )}
        </span>
      ))}
    </p>
  );
}
