import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { Empty } from "@/components/ui";
import ReceiptsClient from "./ReceiptsClient";

export default async function ReceiptsPage() {
  const sesi = await getSession();
  if (!sesi) redirect("/login");
  if (!can(sesi.role, "order.create")) {
    return (
      <div className="p-4 lg:p-8">
        <Empty>Anda tidak punya akses ke halaman Struk.</Empty>
      </div>
    );
  }
  return <ReceiptsClient />;
}
