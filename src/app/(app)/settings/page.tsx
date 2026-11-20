import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { parseTaxConfig } from "@/lib/money";
import SettingsClient, { type ReceiptConfig } from "./SettingsClient";

function bacaReceiptConfig(raw: string): ReceiptConfig {
  try {
    const r = JSON.parse(raw) as Partial<ReceiptConfig>;
    return {
      header: String(r.header ?? ""),
      footer: String(r.footer ?? ""),
      paperWidth: Number(r.paperWidth) === 80 ? 80 : 58,
      bankName: String(r.bankName ?? ""),
      bankAccountNo: String(r.bankAccountNo ?? ""),
      bankAccountName: String(r.bankAccountName ?? ""),
    };
  } catch {
    return { header: "", footer: "", paperWidth: 58, bankName: "", bankAccountNo: "", bankAccountName: "" };
  }
}

export default async function SettingsPage() {
  const sesi = await getSession();
  if (!sesi || !can(sesi.role, "settings.manage")) redirect("/");
  const outlet = await prisma.outlet.findUniqueOrThrow({ where: { id: sesi.outletId } });

  return (
    <SettingsClient
      awal={{
        name: outlet.name,
        address: outlet.address,
        phone: outlet.phone,
        code: outlet.code,
        taxConfig: parseTaxConfig(outlet.taxConfig),
        receiptConfig: bacaReceiptConfig(outlet.receiptConfig),
      }}
      printer={{
        mode: process.env.PRINT_MODE ?? "simulate",
        agentUrl: process.env.PRINT_AGENT_URL ?? "http://localhost:9100",
      }}
    />
  );
}
