import { ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";

/** Denah meja + order aktif (DRAFT/CONFIRMED) per meja. */
export const GET = route(async () => {
  const { outlet } = await konteks("kds.view");
  const tables = await prisma.diningTable.findMany({
    where: { outletId: outlet.id },
    orderBy: [{ area: "asc" }, { name: "asc" }],
    include: {
      orders: {
        where: { status: { in: ["DRAFT", "CONFIRMED"] } },
        select: { id: true, orderNo: true, grandTotal: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  return ok({ tables });
});
