import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import type { Role } from "@/lib/rbac";

const BERANDA: Record<Role, string> = {
  OWNER: "/dashboard",
  MANAGER: "/dashboard",
  KASIR: "/pos",
  DAPUR: "/kds",
  GUDANG: "/stock",
};

/** Root "/" → halaman awal sesuai role. */
export default async function Beranda() {
  const sesi = await getSession();
  if (!sesi) redirect("/login");
  redirect(BERANDA[sesi.role] ?? "/pos");
}
