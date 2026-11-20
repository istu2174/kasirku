import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import StockClient from "./StockClient";

export default async function StockPage() {
  const sesi = await getSession();
  if (!sesi || !can(sesi.role, "stock.opname")) redirect("/");
  // Selain Owner/Manager, penyesuaian stok butuh approval Manager (dicek ulang di server).
  return <StockClient butuhApproval={!can(sesi.role, "order.void")} />;
}
