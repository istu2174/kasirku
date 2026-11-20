import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { Empty, PageHeader } from "@/components/ui";
import TablesClient from "./TablesClient";

export default async function TablesPage() {
  const sesi = await getSession();
  if (!sesi) redirect("/login");

  if (!can(sesi.role, "order.create")) {
    return (
      <div className="p-4 lg:p-8">
        <PageHeader title="Meja" />
        <Empty>Anda tidak punya akses ke halaman ini.</Empty>
      </div>
    );
  }

  const outlet = await prisma.outlet.findUniqueOrThrow({
    where: { id: sesi.outletId },
    select: { businessMode: true },
  });

  if (outlet.businessMode === "MINIMARKET") {
    return (
      <div className="p-4 lg:p-8">
        <PageHeader title="Meja" subtitle="Denah meja & order aktif" />
        <Empty>
          Outlet ini memakai mode Minimarket, jadi transaksi berjalan tanpa meja. Buat order langsung dari halaman
          Kasir.
        </Empty>
      </div>
    );
  }

  return <TablesClient />;
}
