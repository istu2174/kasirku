import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import UsersClient from "./UsersClient";

export default async function UsersPage() {
  const sesi = await getSession();
  if (!sesi || !can(sesi.role, "user.manage")) redirect("/");
  return <UsersClient userIdSaya={sesi.userId} />;
}
