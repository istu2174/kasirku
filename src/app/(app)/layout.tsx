import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can, type Permission } from "@/lib/rbac";
import AppShell, { type NavItem } from "@/components/AppShell";

const NAV: { href: string; label: string; icon: string; izin?: Permission }[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", izin: "dashboard.view" },
  { href: "/pos", label: "Kasir", icon: "pos", izin: "order.create" },
  { href: "/orders", label: "Pesanan", icon: "orders", izin: "order.create" },
  { href: "/tables", label: "Meja", icon: "tables", izin: "order.create" },
  { href: "/kds", label: "Dapur", icon: "kds", izin: "kds.view" },
  { href: "/products", label: "Produk", icon: "products", izin: "product.edit" },
  { href: "/stock", label: "Stok", icon: "stock", izin: "stock.opname" },
  { href: "/shift", label: "Shift & Kas", icon: "shift", izin: "shift.manage" },
  { href: "/receipts", label: "Struk", icon: "receipts", izin: "order.create" },
  { href: "/reports", label: "Laporan", icon: "reports", izin: "report.view" },
  { href: "/users", label: "Pengguna", icon: "users", izin: "user.manage" },
  { href: "/audit", label: "Audit Log", icon: "audit", izin: "audit.view" },
  { href: "/settings", label: "Pengaturan", icon: "settings", izin: "settings.manage" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sesi = await getSession();
  if (!sesi) redirect("/login");

  const outlet = await prisma.outlet.findUnique({ where: { id: sesi.outletId } });
  if (!outlet) redirect("/login");

  const nav: NavItem[] = NAV.map((n) => ({
    href: n.href,
    label: n.label,
    icon: n.icon,
    boleh: n.izin ? can(sesi.role, n.izin) : true,
  }));

  return (
    <AppShell user={{ name: sesi.name, role: sesi.role }} outlet={outlet} nav={nav}>
      {children}
    </AppShell>
  );
}
