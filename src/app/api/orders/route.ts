import { z } from "zod";
import { bacaJson, ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { buatOrder } from "@/lib/order-service";

export const GET = route(async (req) => {
  const { outlet } = await konteks();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 30), 100);

  const orders = await prisma.order.findMany({
    where: {
      outletId: outlet.id,
      // NEEDS_REVIEW bukan status order, tapi flag needsReview.
      ...(status === "NEEDS_REVIEW"
        ? { needsReview: true }
        : status && status !== "ALL"
          ? { status: { in: status.split(",") } }
          : {}),
    },
    include: {
      items: true,
      table: true,
      cashier: { select: { name: true } },
      payments: true,
      receipts: { select: { receiptNo: true, kind: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return ok({ orders });
});

const itemSkema = z.object({
  productId: z.string(),
  variantId: z.string().nullable().optional(),
  qty: z.number().int().positive(),
  modifierIds: z.array(z.string()).default([]),
  note: z.string().max(200).nullable().optional(),
});

const skema = z.object({
  type: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY", "WALK_IN"]),
  tableId: z.string().nullable().optional(),
  guestCount: z.number().int().positive().nullable().optional(),
  note: z.string().max(300).nullable().optional(),
  items: z.array(itemSkema).min(1),
});

export const POST = route(async (req) => {
  const { sesi, outlet } = await konteks("order.create");
  const body = skema.parse(await bacaJson(req));

  const order = await buatOrder(
    { outletId: outlet.id, userId: sesi.userId },
    { ...body, items: body.items },
  );

  return ok({ order }, 201);
});
