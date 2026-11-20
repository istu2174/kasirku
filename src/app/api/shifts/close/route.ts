import { z } from "zod";
import { bacaJson, ok, route } from "@/lib/api";
import { konteks } from "@/lib/session-context";
import { tutupShift } from "@/lib/order-service";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/rbac";

const skema = z.object({
  shiftId: z.string(),
  countedCash: z.number().int().nonnegative(),
  note: z.string().max(300).optional(),
});

/** Tutup shift + hitung selisih kas fisik. */
export const POST = route(async (req) => {
  const { sesi, outlet } = await konteks("shift.manage");
  const body = skema.parse(await bacaJson(req));

  const shift = await tutupShift(
    { outletId: outlet.id, userId: sesi.userId },
    body.shiftId,
    body.countedCash,
    body.note,
  );

  // Data laporan Z setelah tutup.
  const payments = await prisma.payment.findMany({
    where: { status: "PAID", order: { shiftId: body.shiftId } },
    include: { order: { select: { orderNo: true, grandTotal: true } } },
  });
  const perMetode = payments.reduce<Record<string, number>>((acc, p) => {
    acc[p.method] = (acc[p.method] ?? 0) + p.amount;
    return acc;
  }, {});

  return ok({ shift, laporanZ: { perMetode, transaksi: payments.length } });
});
