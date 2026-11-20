import { ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";

/** Tiket dapur: order CONFIRMED/PAID yang itemnya belum SERVED. */
export const GET = route(async () => {
  const { outlet } = await konteks("kds.view");

  const orders = await prisma.order.findMany({
    where: {
      outletId: outlet.id,
      status: { in: ["CONFIRMED", "PAID"] },
      items: { some: { kitchenStatus: { not: "SERVED" } } },
    },
    include: {
      items: { include: { modifiers: true }, where: { kitchenStatus: { not: "SERVED" } } },
      table: true,
    },
    orderBy: { createdAt: "asc" },
    take: 30,
  });

  return ok({ orders });
});
