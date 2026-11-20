import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { Empty } from "@/components/ui";
import OrdersClient from "./OrdersClient";

export default async function OrdersPage() {
  const sesi = await getSession();
  if (!sesi) redirect("/login");
  if (!can(sesi.role, "order.create")) {
    return (
      <div className="p-4 lg:p-8">
        <Empty>Anda tidak punya akses ke halaman Pesanan.</Empty>
      </div>
    );
  }
  return <OrdersClient role={sesi.role} />;
}
