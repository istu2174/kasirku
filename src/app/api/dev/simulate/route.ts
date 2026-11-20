import { z } from "zod";
import { bacaJson, ok, route } from "@/lib/api";
import { konteks } from "@/lib/session-context";
import { prisma } from "@/lib/db";
import { tandaTangan } from "@/lib/payments/fake";
import { prosesWebhook } from "@/lib/payments/webhook-service";
import { HttpError } from "@/lib/rbac";

/**
 * Simulator gateway untuk development: membuat payload webhook bertanda tangan
 * lalu memprosesnya lewat jalur yang sama dengan webhook asli.
 */
const skema = z.object({
  paymentId: z.string(),
  status: z.enum(["settlement", "expire", "deny"]).default("settlement"),
});

export const POST = route(async (req) => {
  const { outlet } = await konteks("order.create");
  const body = skema.parse(await bacaJson(req));

  const payment = await prisma.payment.findFirst({
    where: { id: body.paymentId, order: { outletId: outlet.id } },
    include: { order: true },
  });
  if (!payment) throw new HttpError(404, "Pembayaran tidak ditemukan");
  if (payment.provider !== "FAKE") {
    throw new HttpError(400, "Simulator hanya untuk provider FAKE");
  }

  const payload = JSON.stringify({
    eventId: `evt_dev_${payment.id}_${body.status}_${Date.now()}`,
    providerRef: payment.providerRef,
    orderId: payment.order.orderNo,
    status: body.status,
    amount: payment.amount,
    method: payment.method,
    paidAt: new Date().toISOString(),
  });

  const hasil = await prosesWebhook("fake", payload, { "x-fake-signature": tandaTangan(payload) });
  return ok({ ...hasil.body, webhookStatus: hasil.status, payload });
});
