import { z } from "zod";
import { bacaJson, ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { HttpError } from "@/lib/rbac";

const skema = z.object({ status: z.enum(["NEW", "IN_PROGRESS", "READY", "SERVED"]) });

export const PATCH = route<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const { outlet } = await konteks("kds.view");
  const body = skema.parse(await bacaJson(req));

  const item = await prisma.orderItem.findFirst({
    where: { id, order: { outletId: outlet.id } },
  });
  if (!item) throw new HttpError(404, "Item tidak ditemukan");

  const hasil = await prisma.orderItem.update({ where: { id }, data: { kitchenStatus: body.status } });
  return ok({ item: hasil });
});
