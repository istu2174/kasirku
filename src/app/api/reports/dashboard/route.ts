import { ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { rentangHari } from "@/lib/format";

const METODE = ["CASH", "QRIS", "VA", "MANUAL_TRANSFER"] as const;

/** Dashboard hari ini (timezone outlet) + pembanding kemarin (PRD FR-RPT-01/02/07). Semua via aggregate/groupBy. */
export const GET = route(async () => {
  const { outlet } = await konteks("dashboard.view");
  const hari = rentangHari(outlet.timezone);
  const kemarin = rentangHari(outlet.timezone, new Date(hari.mulai.getTime() - 12 * 60 * 60_000));

  // Omzet bersih: nominal lunas dikurangi yang sudah direfund.
  const perMetodeQuery = (mulai: Date, selesai: Date) =>
    prisma.payment.groupBy({
      by: ["method"],
      where: { status: { in: ["PAID", "REFUNDED"] }, order: { outletId: outlet.id, paidAt: { gte: mulai, lt: selesai } } },
      _sum: { amount: true, refundedAmount: true },
    });
  const orderLunas = {
    outletId: outlet.id,
    status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
    paidAt: { gte: hari.mulai, lt: hari.selesai },
  };

  const whereKritis = {
    outletId: outlet.id,
    product: { trackStock: true, isActive: true },
    qty: { lte: prisma.stock.fields.minQty },
  };

  const [gIni, gLalu, transaksi, terlaris, stokKritis, stokKritisTotal, voidHariIni, perluReview, printGagal] =
    await Promise.all([
    perMetodeQuery(hari.mulai, hari.selesai),
    perMetodeQuery(kemarin.mulai, kemarin.selesai),
    prisma.order.count({ where: orderLunas }),
    prisma.orderItem.groupBy({
      by: ["nameSnapshot"],
      where: { order: orderLunas },
      _sum: { qty: true, lineTotal: true },
      orderBy: { _sum: { qty: "desc" } },
      take: 5,
    }),
    prisma.stock.findMany({
      where: whereKritis,
      select: { qty: true, minQty: true, product: { select: { id: true, name: true } } },
      orderBy: { qty: "asc" },
      take: 10,
    }),
    prisma.stock.count({ where: whereKritis }),
    prisma.order.count({
      where: {
        outletId: outlet.id,
        OR: [
          { status: "CANCELLED", closedAt: { gte: hari.mulai, lt: hari.selesai } },
          { status: { in: ["REFUNDED", "PARTIALLY_REFUNDED"] }, paidAt: { gte: hari.mulai, lt: hari.selesai } },
        ],
      },
    }),
    // Pembayaran nominal tidak cocok (webhook/manual) — belum ada mekanisme "selesai review", jadi tampil 20 terbaru.
    prisma.order.findMany({
      where: { outletId: outlet.id, needsReview: true },
      select: {
        id: true,
        orderNo: true,
        grandTotal: true,
        createdAt: true,
        payments: { select: { method: true, amount: true, status: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.printJob.findMany({
      where: { status: "FAILED", receipt: { outletId: outlet.id } },
      select: { id: true, attempts: true, error: true, createdAt: true, receipt: { select: { receiptNo: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const bersih = (r: { _sum: { amount: number | null; refundedAmount: number | null } }) =>
    (r._sum.amount ?? 0) - (r._sum.refundedAmount ?? 0);
  const perMetode: Record<string, number> = Object.fromEntries(METODE.map((m) => [m, 0]));
  for (const r of gIni) perMetode[r.method] = (perMetode[r.method] ?? 0) + bersih(r);
  const omzet = gIni.reduce((s, r) => s + bersih(r), 0);

  return ok({
    hariIni: {
      tanggal: hari.key,
      omzet,
      transaksi,
      rataRata: transaksi ? Math.round(omzet / transaksi) : 0,
      perMetode,
    },
    kemarin: { omzet: gLalu.reduce((s, r) => s + bersih(r), 0) },
    terlaris: terlaris.map((t) => ({ name: t.nameSnapshot, qty: t._sum.qty ?? 0, omzet: t._sum.lineTotal ?? 0 })),
    stokKritis: stokKritis.map((s) => ({ id: s.product.id, name: s.product.name, qty: s.qty, minQty: s.minQty })),
    stokKritisTotal,
    voidHariIni,
    perluReview: perluReview.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      grandTotal: o.grandTotal,
      createdAt: o.createdAt.toISOString(),
      bayar: o.payments[0] ?? null,
    })),
    printGagal: printGagal.map((j) => ({
      id: j.id,
      receiptNo: j.receipt.receiptNo,
      attempts: j.attempts,
      error: j.error,
      createdAt: j.createdAt.toISOString(),
    })),
  });
});
