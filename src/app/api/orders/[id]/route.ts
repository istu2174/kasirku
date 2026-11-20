import { z } from "zod";
import { bacaJson, ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { HttpError } from "@/lib/rbac";
import { ubahOrder } from "@/lib/order-service";

export const GET = route<{ id: string }>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const { outlet } = await konteks();

  const order = await prisma.order.findFirst({
    where: { id, outletId: outlet.id },
    include: {
      items: { include: { modifiers: true, product: { select: { imageEmoji: true } } } },
      table: true,
      cashier: { select: { name: true } },
      shift: true,
      payments: { include: { events: true } },
      receipts: true,
    },
  });
  if (!order) throw new HttpError(404, "Order tidak ditemukan");
  return ok({ order });
});

const skema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string(),
        variantId: z.string().nullable().optional(),
        qty: z.number().int().positive(),
        modifierIds: z.array(z.string()).default([]),
        note: z.string().max(200).nullable().optional(),
      }),
    )
    .optional(),
  note: z.string().max(300).nullable().optional(),
  discount: z.number().int().nonnegative().optional(),
});

export const PATCH = route<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const { sesi, outlet } = await konteks("order.create");
  const body = skema.parse(await bacaJson(req));

  const order = await ubahOrder({ outletId: outlet.id, userId: sesi.userId }, id, body);
  return ok({ order });
});
