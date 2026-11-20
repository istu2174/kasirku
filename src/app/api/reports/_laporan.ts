import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rentangHari } from "@/lib/format";
import { HttpError } from "@/lib/rbac";

const tgl = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "format YYYY-MM-DD")
  .optional();

/** Rentang [mulai, selesai) dari query from/to (YYYY-MM-DD, hari menurut timezone outlet). Default: hari ini. */
export function rentangQuery(url: URL, timeZone: string) {
  const q = z
    .object({ from: tgl, to: tgl })
    .parse({ from: url.searchParams.get("from") || undefined, to: url.searchParams.get("to") || undefined });
  // Acuan jam 12 siang WIB supaya rentangHari() pasti jatuh ke tanggal yang diminta.
  const hari = (s?: string) => rentangHari(timeZone, s ? new Date(`${s}T12:00:00+07:00`) : new Date());
  const mulai = hari(q.from).mulai;
  const selesai = hari(q.to).selesai;
  if (Number.isNaN(mulai.getTime()) || Number.isNaN(selesai.getTime())) throw new HttpError(400, "Tanggal tidak valid");
  if (mulai >= selesai) throw new HttpError(400, "Tanggal awal harus sebelum tanggal akhir");
  return { mulai, selesai };
}

/** Refund (dengan alasan & approver) + order yang dibatalkan dalam rentang. */
export async function voidRefund(outletId: string, mulai: Date, selesai: Date) {
  const [refunds, batal] = await Promise.all([
    prisma.refund.findMany({
      where: { createdAt: { gte: mulai, lt: selesai }, payment: { order: { outletId } } },
      select: {
        id: true,
        amount: true,
        reason: true,
        status: true,
        createdAt: true,
        approvedBy: { select: { name: true } },
        payment: { select: { method: true, order: { select: { orderNo: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.order.findMany({
      where: { outletId, status: "CANCELLED", closedAt: { gte: mulai, lt: selesai } },
      select: {
        id: true,
        orderNo: true,
        grandTotal: true,
        note: true,
        closedAt: true,
        cashier: { select: { name: true } },
      },
      orderBy: { closedAt: "desc" },
    }),
  ]);
  return {
    refunds: refunds.map((r) => ({
      id: r.id,
      orderNo: r.payment.order.orderNo,
      metode: r.payment.method,
      jumlah: r.amount,
      alasan: r.reason,
      status: r.status,
      oleh: r.approvedBy.name,
      waktu: r.createdAt.toISOString(),
    })),
    batal: batal.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      total: o.grandTotal,
      alasan: o.note ?? "-",
      kasir: o.cashier.name,
      waktu: (o.closedAt ?? new Date(0)).toISOString(),
    })),
  };
}
