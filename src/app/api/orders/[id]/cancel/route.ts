import { z } from "zod";
import { bacaJson, ok, route } from "@/lib/api";
import { konteks } from "@/lib/session-context";
import { batalkanOrder } from "@/lib/order-service";

const skema = z.object({ reason: z.string().min(3, "Alasan wajib diisi") });

export const POST = route<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const { sesi, outlet } = await konteks("order.create");
  const { reason } = skema.parse(await bacaJson(req));
  const order = await batalkanOrder({ outletId: outlet.id, userId: sesi.userId }, id, reason);
  return ok({ order });
});
