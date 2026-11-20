import { ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { HttpError } from "@/lib/rbac";

/** Polling status pembayaran (fallback kalau webhook telat). */
export const GET = route<{ id: string }>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const { outlet } = await konteks();

  const payment = await prisma.payment.findFirst({
    where: { id, order: { outletId: outlet.id } },
    include: {
      order: {
        select: { orderNo: true, status: true, grandTotal: true, receipts: { where: { kind: "SALE" }, take: 1 } },
      },
    },
  });
  if (!payment) throw new HttpError(404, "Pembayaran tidak ditemukan");

  return ok({
    payment: {
      id: payment.id,
      status: payment.status,
      method: payment.method,
      amount: payment.amount,
      expiresAt: payment.expiresAt,
      paidAt: payment.paidAt,
    },
    order: payment.order,
    receipt: payment.order.receipts[0] ?? null,
  });
});
