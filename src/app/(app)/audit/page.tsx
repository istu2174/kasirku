import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import AuditClient from "./AuditClient";

export default async function AuditPage() {
  const sesi = await getSession();
  if (!sesi || !can(sesi.role, "audit.view")) redirect("/");
  return <AuditClient />;
}
