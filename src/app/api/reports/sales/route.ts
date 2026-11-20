import { z } from "zod";
import { ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { rentangQuery, voidRefund } from "../_laporan";

type Baris = { label: string; qty: number; total: number };

const Query = z.object({
  type: z.enum(["sales", "refunds"]).default("sales"),
  groupBy: z.enum(["product", "category", "cashier", "hour", "method"]).default("product"),
});

/** Laporan penjualan per produk / kategori / kasir / jam / metode bayar, atau daftar void & refund (type=refunds). */
export const GET = route(async (req) => {
  const { outlet } = await konteks("report.view");
  const url = new URL(req.url);
  const { type, groupBy } = Query.parse({
    type: url.searchParams.get("type") || undefined,
    groupBy: url.searchParams.get("groupBy") || undefined,
  });
  const { mulai, selesai } = rentangQuery(url, outlet.timezone);
  const rentang = { dari: mulai.toISOString(), sampai: selesai.toISOString() };

  if (type === "refunds") {
    return ok({ ...rentang, ...(await voidRefund(outlet.id, mulai, selesai)) });
  }

  // Order lunas (refund penuh tidak dihitung; refund sebagian tetap dihitung bruto).
  const whereOrder = {
    outletId: outlet.id,
    status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
    paidAt: { gte: mulai, lt: selesai },
  };

  const [agg, baris] = await Promise.all([
    prisma.order.aggregate({ where: whereOrder, _sum: { grandTotal: true }, _count: true }),
    hitungBaris(groupBy, whereOrder, outlet.timezone),
  ]);

  return ok({
    groupBy,
    ...rentang,
    baris: baris.sort((a, b) => (groupBy === "hour" ? a.label.localeCompare(b.label) : b.total - a.total)),
    totalOmzet: agg._sum.grandTotal ?? 0,
    jumlahOrder: agg._count,
  });
});

async function hitungBaris(
  groupBy: z.infer<typeof Query>["groupBy"],
  whereOrder: { outletId: string; status: { in: string[] }; paidAt: { gte: Date; lt: Date } },
  timeZone: string,
): Promise<Baris[]> {
  if (groupBy === "product") {
    const g = await prisma.orderItem.groupBy({
      by: ["nameSnapshot"],
      where: { order: whereOrder },
      _sum: { qty: true, lineTotal: true },
    });
    return g.map((r) => ({ label: r.nameSnapshot, qty: r._sum.qty ?? 0, total: r._sum.lineTotal ?? 0 }));
  }

  if (groupBy === "category") {
    const g = await prisma.orderItem.groupBy({
      by: ["productId"],
      where: { order: whereOrder },
      _sum: { qty: true, lineTotal: true },
    });
    const produk = await prisma.product.findMany({
      where: { id: { in: g.map((r) => r.productId) } },
      select: { id: true, category: { select: { name: true } } },
    });
    const kat = new Map(produk.map((p) => [p.id, p.category?.name ?? "Tanpa kategori"]));
    const peta = new Map<string, Baris>();
    for (const r of g) {
      const label = kat.get(r.productId) ?? "Tanpa kategori";
      const rec = peta.get(label) ?? { label, qty: 0, total: 0 };
      rec.qty += r._sum.qty ?? 0;
      rec.total += r._sum.lineTotal ?? 0;
      peta.set(label, rec);
    }
    return [...peta.values()];
  }

  if (groupBy === "cashier") {
    const g = await prisma.order.groupBy({
      by: ["cashierId"],
      where: whereOrder,
      _sum: { grandTotal: true },
      _count: true,
    });
    const users = await prisma.user.findMany({
      where: { id: { in: g.map((r) => r.cashierId) } },
      select: { id: true, name: true },
    });
    const nama = new Map(users.map((u) => [u.id, u.name]));
    return g.map((r) => ({ label: nama.get(r.cashierId) ?? "-", qty: r._count, total: r._sum.grandTotal ?? 0 }));
  }

  if (groupBy === "method") {
    // Nominal bersih per metode: dibayar dikurangi yang sudah direfund.
    const g = await prisma.payment.groupBy({
      by: ["method"],
      where: { status: { in: ["PAID", "REFUNDED"] }, order: { outletId: whereOrder.outletId, paidAt: whereOrder.paidAt } },
      _sum: { amount: true, refundedAmount: true },
      _count: true,
    });
    return g.map((r) => ({
      label: r.method,
      qty: r._count,
      total: (r._sum.amount ?? 0) - (r._sum.refundedAmount ?? 0),
    }));
  }

  // hour: jam lokal outlet tidak bisa di-groupBy di SQL portabel, jadi agregasi di memori dari kolom minimal.
  const orders = await prisma.order.findMany({ where: whereOrder, select: { paidAt: true, grandTotal: true } });
  const fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone });
  const peta = new Map<string, Baris>();
  for (const o of orders) {
    if (!o.paidAt) continue;
    const label = `${fmt.format(o.paidAt).padStart(2, "0")}:00`;
    const rec = peta.get(label) ?? { label, qty: 0, total: 0 };
    rec.qty += 1;
    rec.total += o.grandTotal;
    peta.set(label, rec);
  }
  return [...peta.values()];
}
