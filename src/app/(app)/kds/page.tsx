import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Empty, PageHeader } from "@/components/ui";
import KdsClient from "./KdsClient";

export default async function KdsPage() {
  const sesi = await getSession();
  if (!sesi) redirect("/login");

  if (!can(sesi.role, "kds.view")) {
    return (
      <div className="p-4 lg:p-8">
        <PageHeader title="Dapur" />
        <Empty>Anda tidak punya akses ke halaman ini.</Empty>
      </div>
    );
  }

  return <KdsClient />;
}
