import { z } from "zod";
import { bacaJson, ok, route } from "@/lib/api";
import { konteks } from "@/lib/session-context";
import { buatCharge } from "@/lib/order-service";

const skema = z.object({
  method: z.enum(["QRIS", "VA"]),
  expiresInMinutes: z.number().int().positive().max(120).default(15),
});

export const POST = route<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const { sesi, outlet } = await konteks("order.create");
  const body = skema.parse(await bacaJson(req));

  const { payment, charge } = await buatCharge(
    { outletId: outlet.id, userId: sesi.userId },
    id,
    body.method,
    body.expiresInMinutes,
  );

  return ok({
    paymentId: payment.id,
    providerRef: charge.providerRef,
    qrString: charge.qrString,
    qrImageUrl: charge.qrImageUrl,
    vaNumber: charge.vaNumber,
    expiresAt: charge.expiresAt,
    amount: payment.amount,
  });
});
