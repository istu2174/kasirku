import { z } from "zod";
import { bacaJson, ok, route } from "@/lib/api";
import { konteks } from "@/lib/session-context";
import { bayarCash } from "@/lib/order-service";

const skema = z.object({
  amountReceived: z.number().int().nonnegative(),
  idempotencyKey: z.string().optional(),
});

export const POST = route<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const { sesi, outlet } = await konteks("order.create");
  const body = skema.parse(await bacaJson(req));

  const hasil = await bayarCash(
    { outletId: outlet.id, userId: sesi.userId },
    id,
    body.amountReceived,
    body.idempotencyKey,
  );

  return ok({
    payment: hasil.payment,
    change: hasil.change,
    receipt: hasil.receipt,
  });
});
