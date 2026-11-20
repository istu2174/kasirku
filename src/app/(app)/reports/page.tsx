import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import ReportsClient from "./ReportsClient";

export default async function ReportsPage() {
  const sesi = await getSession();
  if (!sesi || !can(sesi.role, "report.view")) redirect("/");
  return <ReportsClient />;
}
