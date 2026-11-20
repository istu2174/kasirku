import { ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { parseTaxConfig } from "@/lib/money";
import { teksStruk } from "@/lib/struk";
import { lebarKertas } from "@/lib/print-worker";
import { HttpError } from "@/lib/rbac";
import { contohStruk } from "../contoh-struk";

/** Tes cetak struk contoh dengan pengaturan outlet yang tersimpan. Tidak membuat struk/nomor baru. */
export const POST = route(async () => {
  const { outlet } = await konteks("settings.manage");
  const data = await prisma.outlet.findUniqueOrThrow({ where: { id: outlet.id } });
  const lebar = lebarKertas(data.receiptConfig);
  let footer = "";
  try {
    footer = String(JSON.parse(data.receiptConfig).footer ?? "");
  } catch {
    footer = "";
  }
  const teks = teksStruk(contohStruk(data, parseTaxConfig(data.taxConfig), footer), lebar);
  const mode = process.env.PRINT_MODE ?? "simulate";

  if (mode !== "agent") return ok({ mode, pesan: "Mode simulasi: tidak ada printer fisik yang dipanggil" });

  const url = process.env.PRINT_AGENT_URL ?? "http://localhost:9100";
  try {
    const res = await fetch(`${url}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-agent-token": process.env.PRINT_AGENT_TOKEN ?? "" },
      body: JSON.stringify({ text: teks, width: lebar, cut: true }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`Print agent menolak: ${res.status}`);
  } catch (err) {
    throw new HttpError(502, `Gagal tes cetak: ${err instanceof Error ? err.message : "print agent tidak terjangkau"}`);
  }
  return ok({ mode, pesan: "Struk contoh terkirim ke printer" });
});
