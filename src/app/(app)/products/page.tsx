import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import ProductsClient from "./ProductsClient";

export default async function ProductsPage() {
  const sesi = await getSession();
  if (!sesi || !can(sesi.role, "product.edit")) redirect("/");
  return <ProductsClient />;
}
