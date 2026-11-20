import "server-only";
import { prisma } from "@/lib/db";
import { daftarkanHandler, enqueue } from "@/lib/queue";
import { teksStruk, type ReceiptPayload } from "@/lib/struk";

/**
 * Worker cetak struk. Mode:
 * - "agent": kirim teks ESC/POS ke print agent lokal (print-agent/).
 * - "simulate": tandai PRINTED tanpa printer fisik (default dev).
 * - "none": belum punya printer; job ditandai SKIPPED, struk cukup tampil/dicetak dari browser.
 * Job gagal tetap tersimpan supaya kasir bisa cetak ulang tanpa kehilangan nomor.
 */
async function prosesCetak(payload: unknown) {
  const { receiptId } = payload as { receiptId: string };
  if (!receiptId) throw new Error("receiptId kosong");

  const job = await prisma.printJob.findFirst({
    where: { receiptId, status: { in: ["QUEUED", "FAILED"] } },
    orderBy: { createdAt: "desc" },
    include: { receipt: true },
  });
  if (!job) return;

  const isi = JSON.parse(job.receipt.payloadJson) as ReceiptPayload;
  const outlet = await prisma.outlet.findUniqueOrThrow({ where: { id: job.receipt.outletId } });
  const lebar = lebarKertas(outlet.receiptConfig);
  // Cetakan kedua dst. diberi label REPRINT; retry cetakan pertama yang gagal tidak.
  const teks = teksStruk(isi, lebar, { reprint: job.receipt.printedCount > 0 });
  const qr = `${process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000"}${isi.digitalUrl}`;
  const mode = process.env.PRINT_MODE ?? "simulate";

  if (mode === "agent") {
    const url = process.env.PRINT_AGENT_URL ?? "http://localhost:9100";
    try {
      const res = await fetch(`${url}/print`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-agent-token": process.env.PRINT_AGENT_TOKEN ?? "",
        },
        body: JSON.stringify({ text: teks, width: lebar, qr, cut: true }),
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error(`Print agent menolak: ${res.status}`);
      await prisma.printJob.update({
        where: { id: job.id },
        data: { status: "PRINTED", attempts: { increment: 1 } },
      });
      await prisma.receipt.update({
        where: { id: receiptId },
        data: { printedCount: { increment: 1 } },
      });
    } catch (err) {
      await prisma.printJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          attempts: { increment: 1 },
          error: err instanceof Error ? err.message : "gagal kirim ke printer",
        },
      });
      throw err; // biar queue retry (max 5)
    }
    return;
  }

  if (mode === "none") {
    // Belum ada printer: struk tetap tersimpan & tampil di layar, job ditandai SKIPPED (bukan "tercetak").
    await prisma.printJob.update({
      where: { id: job.id },
      data: { status: "SKIPPED", attempts: { increment: 1 }, error: "Printer belum dikonfigurasi (PRINT_MODE=none)" },
    });
    return;
  }

  // Mode simulasi: struk dianggap tercetak (dipakai untuk demo lokal).
  await prisma.printJob.update({
    where: { id: job.id },
    data: { status: "PRINTED", attempts: { increment: 1 }, error: null },
  });
  await prisma.receipt.update({
    where: { id: receiptId },
    data: { printedCount: { increment: 1 } },
  });
}

/** 58mm = 32 karakter, 80mm = 48 karakter (receiptConfig.paperWidth). */
export function lebarKertas(receiptConfig: string): 32 | 48 {
  try {
    return Number(JSON.parse(receiptConfig).paperWidth) === 80 ? 48 : 32;
  } catch {
    return 32;
  }
}

let terpasang = false;

/** Dipanggil sekali saat server start (instrumentation). */
export function pasangWorkerCetak() {
  if (terpasang) return;
  terpasang = true;
  daftarkanHandler("receipt.print", prosesCetak);
  // shortcut: notifikasi hanya log server; sambungkan ke WhatsApp/email di fase 2.
  daftarkanHandler("notification.push", async (p) => console.warn("[notifikasi]", JSON.stringify(p)));
}

/** Cetak ulang manual dari UI. */
export async function cetakUlang(receiptId: string) {
  const job = await prisma.printJob.create({
    data: { receiptId, status: "QUEUED", printerId: "default" },
  });
  void enqueue("receipt.print", { receiptId });
  return job;
}
