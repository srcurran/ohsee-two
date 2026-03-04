import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between bg-surface-tertiary px-[140px] py-[8px]">
      <Link href="/" className="text-[12px] font-bold text-black">
        OHSEE
      </Link>
    </nav>
  );
}
