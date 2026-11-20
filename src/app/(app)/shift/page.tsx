import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Empty, PageHeader } from "@/components/ui";
import ShiftClient from "./ShiftClient";

export default async function ShiftPage() {
  const sesi = await getSession();
  if (!sesi) redirect("/login");

  if (!can(sesi.role, "shift.manage")) {
    return (
      <div className="p-4 lg:p-8">
        <PageHeader title="Shift & Kas" />
        <Empty>Anda tidak punya akses ke halaman ini.</Empty>
      </div>
    );
  }

  return <ShiftClient />;
}
