import "server-only";
import { prisma } from "@/lib/db";
import { providerUntuk } from "@/lib/payments";
import { tandaiExpired, tandaiLunas } from "@/lib/order-service";

/**
 * Rekonsiliasi pembayaran PENDING (PRD §13: webhook telat/hilang).
 * - Provider dengan cekStatus (Midtrans): tanya status ke gateway, terapkan lewat jalur yang sama.
 * - Semua provider: charge yang lewat expiresAt ditandai EXPIRED (order tetap UNPAID).
 */
const g = globalThis as unknown as { __kasirkuChargeTerakhir?: number };

/** Dipanggil saat charge QRIS/VA dibuat; rekonsiliasi hanya jalan kalau ada charge baru-baru ini. */
export function tandaiAdaCharge() {
  g.__kasirkuChargeTerakhir = Date.now();
}

export async function rekonsiliasi(): Promise<{ dicek: number; lunas: number; expired: number }> {
  const pending = await prisma.payment.findMany({
    where: { status: "PENDING", method: { in: ["QRIS", "VA", "EWALLET"] } }, // transfer manual butuh approve manusia
    include: { order: { select: { orderNo: true } } },
    take: 200,
  });
  let lunas = 0;
  let expired = 0;
  for (const p of pending) {
    try {
      const provider = providerUntuk(p.provider);
      const ev =
        provider.cekStatus && p.providerRef
          ? await provider.cekStatus({ orderNo: p.order.orderNo, providerRef: p.providerRef })
          : null;
      if (ev?.status === "settlement") {
        await tandaiLunas(p.id, { amount: ev.amount, paidAt: ev.paidAt ? new Date(ev.paidAt) : undefined });
        lunas++;
      } else if (ev?.status === "expire" || (p.expiresAt && p.expiresAt < new Date())) {
        await tandaiExpired(p.id);
        expired++;
      }
    } catch (err) {
      // Nominal beda (NEEDS_REVIEW) atau gateway error: lanjut ke pembayaran berikutnya.
      console.warn("[rekonsiliasi]", p.id, err instanceof Error ? err.message : err);
    }
  }
  return { dicek: pending.length, lunas, expired };
}

let timer: ReturnType<typeof setInterval> | null = null;

export function jadwalkanRekonsiliasi(intervalMs = 5 * 60_000) {
  if (timer) return;
  // shortcut: interval dalam proses web; di production multi-instance pindah ke BullMQ repeatable job.
  // Hemat kuota DB serverless (Neon tidur saat idle): skip kalau 3 jam terakhir tak ada charge baru.
  // Saat start tetap cek sekali untuk charge yang tertinggal sebelum restart.
  void rekonsiliasi();
  timer = setInterval(() => {
    if (Date.now() - (g.__kasirkuChargeTerakhir ?? 0) < 3 * 3600_000) void rekonsiliasi();
  }, intervalMs);
}
