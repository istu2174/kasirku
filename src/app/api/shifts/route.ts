import { z } from "zod";
import { bacaJson, ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { bukaShift, shiftAktif } from "@/lib/order-service";

export const GET = route(async () => {
  const { outlet } = await konteks();
  const aktif = await shiftAktif(outlet.id);
  const riwayat = await prisma.shift.findMany({
    where: { outletId: outlet.id, status: "CLOSED" },
    orderBy: { closedAt: "desc" },
    take: 10,
    include: { user: { select: { name: true } } },
  });

  // Ringkasan shift aktif untuk laporan X.
  let ringkas = null;
  if (aktif) {
    const agg = await prisma.payment.aggregate({
      where: { status: "PAID", order: { shiftId: aktif.id } },
      _sum: { amount: true },
      _count: true,
    });
    const cash = await prisma.payment.aggregate({
      where: { status: "PAID", method: "CASH", order: { shiftId: aktif.id } },
      _sum: { amount: true },
    });
    ringkas = {
      total: agg._sum.amount ?? 0,
      transaksi: agg._count,
      cash: cash._sum.amount ?? 0,
      nonCash: (agg._sum.amount ?? 0) - (cash._sum.amount ?? 0),
      expectedCash: aktif.openingCash + (cash._sum.amount ?? 0),
    };
  }

  // Jangan kirim objek user lengkap (berisi hash password/PIN) ke klien.
  const shift = aktif ? { ...aktif, user: { name: aktif.user.name } } : null;
  return ok({ shift, ringkas, riwayat });
});

const skemaBuka = z.object({ openingCash: z.number().int().nonnegative() });

export const POST = route(async (req) => {
  const { sesi, outlet } = await konteks("shift.manage");
  const body = skemaBuka.parse(await bacaJson(req));
  const shift = await bukaShift({ outletId: outlet.id, userId: sesi.userId }, body.openingCash);
  return ok({ shift }, 201);
});
