import { z } from "zod";
import { bacaJson, ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { HttpError } from "@/lib/rbac";
import { catatAudit } from "@/lib/audit";
import { tandaiLunas } from "@/lib/order-service";

/**
 * Manager menyelesaikan pembayaran NEEDS_REVIEW (nominal webhook ≠ total order).
 * ACCEPT: manager memastikan dana diterima → lunas lewat jalur yang sama (struk otomatis).
 * DISMISS: pembayaran ditolak (FAILED), order tetap belum dibayar.
 */
const skema = z.object({
  paymentId: z.string().min(1),
  action: z.enum(["ACCEPT", "DISMISS"]),
  note: z.string().trim().min(3, "Catatan review wajib diisi"),
});

export const POST = route<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const { sesi, outlet, tenantId } = await konteks("order.void");
  const body = skema.parse(await bacaJson(req));

  const payment = await prisma.payment.findFirst({
    where: { id: body.paymentId, orderId: id, order: { outletId: outlet.id } },
  });
  if (!payment) throw new HttpError(404, "Pembayaran tidak ditemukan");
  if (payment.status !== "NEEDS_REVIEW") throw new HttpError(409, "Pembayaran tidak sedang direview");

  if (body.action === "ACCEPT") {
    await tandaiLunas(payment.id); // tanpa cek nominal: keputusan manusia, tercatat di audit
  } else {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
  }
  await prisma.order.update({ where: { id }, data: { needsReview: false } });
  await catatAudit({
    tenantId,
    outletId: outlet.id,
    userId: sesi.userId,
    action: body.action === "ACCEPT" ? "PAYMENT_REVIEW_ACCEPT" : "PAYMENT_REVIEW_DISMISS",
    entity: "Payment",
    entityId: payment.id,
    before: { status: "NEEDS_REVIEW", amount: payment.amount },
    after: { action: body.action, note: body.note },
  });
  return ok({ ok: true });
});
