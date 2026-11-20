"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { clsx } from "clsx";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  CookingPot,
  CreditCard,
  LayoutGrid,
  LogOut,
  Menu,
  ReceiptText,
  Settings,
  ShieldCheck,
  Store,
  Users,
  Wallet,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: string; boleh: boolean };

const IKON: Record<string, React.ComponentType<{ size?: number }>> = {
  dashboard: LayoutGrid,
  pos: CreditCard,
  orders: ClipboardList,
  tables: Store,
  kds: CookingPot,
  products: Boxes,
  stock: Boxes,
  shift: Wallet,
  reports: BarChart3,
  receipts: ReceiptText,
  users: Users,
  audit: ShieldCheck,
  settings: Settings,
};

export default function AppShell({
  children,
  user,
  outlet,
  nav,
}: {
  children: React.ReactNode;
  user: { name: string; role: string };
  outlet: { name: string; businessMode: string };
  nav: NavItem[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [buka, setBuka] = useState(false);
  const item = nav.filter((n) => n.boleh);

  async function keluar() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop */}
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col p-4 lg:flex">
        <div className="neu flex h-full flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-grad-brand text-lg shadow-glow">🧾</div>
          <div>
            <p className="text-grad text-base font-extrabold leading-tight">KasirKu</p>
            <p className="text-[11px] text-muted">{outlet.name}</p>
          </div>
        </div>
        <OutletSwitcher />
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {item.map((n) => {
            const Ikon = IKON[n.icon] ?? LayoutGrid;
            const aktif = pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                className={clsx(
                  "flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition",
                  aktif ? "bg-base-800 text-brand-700 shadow-neu-in" : "text-muted hover:text-fg",
                )}
              >
                <Ikon size={18} />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line p-3">
          <div className="neu-in mb-2 px-3 py-2">
            <p className="truncate text-sm font-bold">{user.name}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">{user.role}</p>
          </div>
          <button
            onClick={keluar}
            className="flex min-h-11 w-full items-center gap-2 rounded-2xl px-3 text-sm font-semibold text-muted hover:bg-rose-500/10 hover:text-rose-600"
          >
            <LogOut size={16} /> Keluar
          </button>
        </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar mobile */}
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-line bg-base-800/90 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setBuka((v) => !v)} className="grid h-11 w-11 place-items-center rounded-2xl shadow-neu-sm" aria-label="Menu">
            <Menu size={20} />
          </button>
          <p className="text-grad text-sm font-extrabold">KasirKu</p>
          <div className="grid h-9 w-9 place-items-center rounded-full bg-grad-brand text-xs font-bold text-white">
            {user.name.slice(0, 1)}
          </div>
        </header>

        {buka && (
          <div className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={() => setBuka(false)}>
            <div className="h-full w-72 bg-base-800 p-4 shadow-neu" onClick={(e) => e.stopPropagation()}>
              <p className="mb-3 px-2 text-xs font-bold uppercase tracking-wide text-muted">{outlet.name}</p>
              <OutletSwitcher />
              <div className="space-y-0.5">
                {item.map((n) => {
                  const Ikon = IKON[n.icon] ?? LayoutGrid;
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      onClick={() => setBuka(false)}
                      className={clsx(
                        "flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold",
                        pathname.startsWith(n.href) ? "text-brand-700 shadow-neu-in" : "text-muted",
                      )}
                    >
                      <Ikon size={18} /> {n.label}
                    </Link>
                  );
                })}
              </div>
              <button
                onClick={keluar}
                className="mt-4 flex min-h-11 w-full items-center gap-2 rounded-2xl px-3 text-sm font-semibold text-rose-600"
              >
                <LogOut size={16} /> Keluar
              </button>
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

/** Pindah outlet aktif untuk user yang ditugaskan di lebih dari satu outlet. */
function OutletSwitcher() {
  const [data, setData] = useState<{ aktif: string; outlets: { id: string; name: string }[] } | null>(null);

  useEffect(() => {
    api<{ aktif: string; outlets: { id: string; name: string }[] }>("/api/auth/outlet")
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data || data.outlets.length < 2) return null;
  return (
    <div className="px-3 pb-3">
      <select
        aria-label="Pilih outlet"
        value={data.aktif}
        onChange={async (e) => {
          await api("/api/auth/outlet", { method: "POST", body: JSON.stringify({ outletId: e.target.value }) });
          window.location.assign("/");
        }}
        className="min-h-11 w-full rounded-2xl bg-base-800 px-3 text-sm font-semibold text-fg shadow-neu-in outline-none"
      >
        {data.outlets.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}
