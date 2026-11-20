import { ok, route } from "@/lib/api";
import { konteks } from "@/lib/session-context";
import { konfirmasiOrder } from "@/lib/order-service";

export const POST = route<{ id: string }>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const { sesi, outlet } = await konteks("order.create");
  const order = await konfirmasiOrder({ outletId: outlet.id, userId: sesi.userId }, id);
  return ok({ order });
});
