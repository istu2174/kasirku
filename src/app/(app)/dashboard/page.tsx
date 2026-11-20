import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const sesi = await getSession();
  if (!sesi || !can(sesi.role, "dashboard.view")) redirect("/");
  return <DashboardClient />;
}
