"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Hoy" },
  { href: "/plan-recetas", label: "Plan recetas" },
  { href: "/plan-fuerza", label: "Plan fuerza" },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const nav = NAV.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      aria-current={
        (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)) ? "page" : undefined
      }
      className={
        (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href))
          ? "text-white bg-primary rounded-lg px-3 py-2 font-semibold"
          : "text-text-secondary hover:text-text rounded-lg px-3 py-2 font-medium"
      }
    >
      {item.label}
    </Link>
  ));

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col gap-2 border-r border-border bg-surface p-4 md:w-56">
        <div className="mb-4 text-xl font-bold text-primary">Esencial</div>
        <nav className="flex flex-col gap-1">{nav}</nav>
      </aside>

      <main className="flex-1 p-4 pb-20 md:pb-4">{children}</main>

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 flex justify-around border-t border-border bg-surface p-2 md:hidden">
        {nav}
      </nav>
    </div>
  );
}
