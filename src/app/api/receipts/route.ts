import { ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";

export const GET = route(async (req) => {
  const { outlet } = await konteks();
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 30), 100);

  const receipts = await prisma.receipt.findMany({
    where: { outletId: outlet.id },
    include: {
      order: { select: { orderNo: true, grandTotal: true, status: true } },
      jobs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { issuedAt: "desc" },
    take: limit,
  });

  return ok({ receipts });
});
