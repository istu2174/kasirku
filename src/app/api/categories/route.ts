import { z } from "zod";
import { bacaJson, ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";

export const GET = route(async () => {
  const { outlet } = await konteks();
  const categories = await prisma.category.findMany({
    where: { outletId: outlet.id },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: true } } },
  });
  return ok({ categories });
});

const skema = z.object({ name: z.string().trim().min(2), sortOrder: z.number().int().default(0) });

export const POST = route(async (req) => {
  const { outlet } = await konteks("product.edit");
  const body = skema.parse(await bacaJson(req));
  const category = await prisma.category.create({
    data: { outletId: outlet.id, name: body.name, sortOrder: body.sortOrder },
  });
  return ok({ category }, 201);
});

const skemaUrutan = z.object({ order: z.array(z.string()).min(1) });

/** Atur urutan kategori: body.order = daftar id dari atas ke bawah. */
export const PATCH = route(async (req) => {
  const { outlet } = await konteks("product.edit");
  const { order } = skemaUrutan.parse(await bacaJson(req));
  await prisma.$transaction(
    order.map((id, i) => prisma.category.updateMany({ where: { id, outletId: outlet.id }, data: { sortOrder: i } })),
  );
  return ok({ ok: true });
});
