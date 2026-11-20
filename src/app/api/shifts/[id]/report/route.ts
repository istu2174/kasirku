import { ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { HttpError } from "@/lib/rbac";

/** Laporan X (shift berjalan) atau Z (shift tutup). */
export const GET = route<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const { outlet } = await konteks("shift.manage");
  const tipe = new URL(req.url).searchParams.get("type") === "Z" ? "Z" : "X";

  const shift = await prisma.shift.findFirst({
    where: { id, outletId: outlet.id },
    include: { user: { select: { name: true } } },
  });
  if (!shift) throw new HttpError(404, "Shift tidak ditemukan");
  if (tipe === "Z" && shift.status !== "CLOSED") throw new HttpError(409, "Laporan Z hanya untuk shift yang sudah ditutup");

  // Penjualan kotor: pembayaran yang pernah lunas, termasuk yang kemudian direfund penuh (status REFUNDED).
  const payments = await prisma.payment.findMany({
    where: { status: { in: ["PAID", "REFUNDED"] }, order: { shiftId: id } },
    select: { method: true, amount: true, status: true },
  });

  const perMetode: Record<string, { jumlah: number; total: number }> = {};
  for (const p of payments) {
    perMetode[p.method] ??= { jumlah: 0, total: 0 };
    perMetode[p.method].jumlah += 1;
    perMetode[p.method].total += p.amount;
  }

  // Refund yang terjadi selama shift berjalan (uang keluar dari laci saat itu).
  const akhir = shift.closedAt ?? new Date();
  const refunds = await prisma.refund.findMany({
    where: {
      createdAt: { gte: shift.openedAt, lte: akhir },
      payment: { order: { outletId: outlet.id } },
    },
    select: { amount: true, payment: { select: { method: true } } },
  });
  const refundCash = refunds.filter((r) => r.payment.method === "CASH").reduce((s, r) => s + r.amount, 0);
  const refundTotal = refunds.reduce((s, r) => s + r.amount, 0);

  const cashKotor = perMetode.CASH?.total ?? 0;
  const kasSeharusnya = shift.openingCash + cashKotor - refundCash;
  // Angka yang dipakai tutupShift() di lib (belum mengurangi refund cash parsial / lintas shift).
  const cashPaid = payments.filter((p) => p.method === "CASH" && p.status === "PAID").reduce((s, p) => s + p.amount, 0);
  const kasTercatat = shift.status === "CLOSED" ? shift.expectedCash : shift.openingCash + cashPaid;

  const voidOrders = await prisma.order.findMany({
    where: { shiftId: id, status: { in: ["REFUNDED", "PARTIALLY_REFUNDED", "CANCELLED"] } },
    select: { orderNo: true, grandTotal: true, status: true },
  });

  return ok({
    tipe,
    outletName: outlet.name,
    shift,
    perMetode,
    totalPenjualan: payments.reduce((s, p) => s + p.amount, 0),
    jumlahTransaksi: payments.length,
    refundCash,
    refundTotal,
    jumlahRefund: refunds.length,
    kasSeharusnya,
    kasTercatat,
    kasFisik: shift.countedCash,
    selisih: shift.countedCash === null ? null : shift.countedCash - kasSeharusnya,
    voidOrders,
    dicetakPada: new Date().toISOString(),
  });
});
