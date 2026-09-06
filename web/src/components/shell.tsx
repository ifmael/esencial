// E0 shell ported from legacy/next-app: desktop sidebar + mobile bottom tabs.
// next/link → react-router Link; usePathname → useLocation. E7: logout button.
import { Link, useLocation, useNavigate } from "react-router";

const NAV = [
  { href: "/", label: "Hoy" },
  { href: "/plan-recetas", label: "Plan recetas" },
  { href: "/plan-fuerza", label: "Plan fuerza" },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const nav = NAV.map((item) => {
    const active =
      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    return (
      <Link
        key={item.href}
        to={item.href}
        aria-current={active ? "page" : undefined}
        className={
          active
            ? "text-white bg-primary rounded-lg px-3 py-2 font-semibold"
            : "text-text-secondary hover:text-text rounded-lg px-3 py-2 font-medium"
        }
      >
        {item.label}
      </Link>
    );
  });

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col gap-2 border-r border-border bg-surface p-4 md:w-56">
        <div className="mb-4 text-xl font-bold text-primary">Esencial</div>
        <nav className="flex flex-col gap-1">{nav}</nav>
        <button
          type="button"
          className="btn-secondary mt-auto"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            navigate("/login");
          }}
        >
          Cerrar sesión
        </button>
      </aside>

      <main className="flex-1 p-4 pb-20 md:pb-4">{children}</main>

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 flex justify-around border-t border-border bg-surface p-2 md:hidden">
        {nav}
        <button
          type="button"
          className="rounded-lg px-3 py-2 font-medium text-text-secondary"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            navigate("/login");
          }}
        >
          Salir
        </button>
      </nav>
    </div>
  );
}
