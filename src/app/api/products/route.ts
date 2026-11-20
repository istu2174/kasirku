import { z } from "zod";
import { bacaJson, ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { catatAudit } from "@/lib/audit";
import { cekKategori, cekUnik, skemaGrupModifier, skemaVarian } from "./skema";

export const GET = route(async (req) => {
  const { sesi, outlet } = await konteks();
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const kategori = url.searchParams.get("categoryId") ?? undefined;
  const semua = url.searchParams.get("all") === "1";

  // SQLite sudah case-insensitive untuk ASCII; Postgres butuh mode insensitive.
  const ci = (process.env.DATABASE_URL ?? "").startsWith("postgres") ? ({ mode: "insensitive" } as const) : {};
  const produk = await prisma.product.findMany({
    where: {
      outletId: outlet.id,
      ...(semua ? {} : { isActive: true }),
      ...(kategori ? { categoryId: kategori } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, ...ci } },
              { sku: { contains: q, ...ci } },
              { barcode: { contains: q } },
            ],
          }
        : {}),
    },
    include: {
      category: true,
      variants: true,
      modifierGroups: { include: { modifiers: true } },
      stocks: { where: { outletId: outlet.id } },
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
  });

  return ok({
    products: produk.map((p) => ({
      ...p,
      stock: p.stocks[0]?.qty ?? 0,
      minQty: p.stocks[0]?.minQty ?? p.minQty,
      stocks: undefined,
    })),
    role: sesi.role,
  });
});

const skema = z.object({
  name: z.string().trim().min(2),
  sku: z.string().trim().min(2),
  barcode: z.string().trim().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  price: z.number().int().nonnegative(),
  cost: z.number().int().nonnegative().default(0),
  imageEmoji: z.string().default("🍽️"),
  trackStock: z.boolean().default(true),
  minQty: z.number().int().nonnegative().default(0),
  isActive: z.boolean().default(true),
  variants: z.array(skemaVarian).default([]),
  modifierGroups: z.array(skemaGrupModifier).default([]),
});

export const POST = route(async (req) => {
  const { sesi, outlet, tenantId } = await konteks("product.edit");
  const body = skema.parse(await bacaJson(req));
  await cekUnik(outlet.id, body.sku, body.barcode);
  await cekKategori(outlet.id, body.categoryId);

  const produk = await prisma.product.create({
    data: {
      outletId: outlet.id,
      name: body.name,
      sku: body.sku,
      barcode: body.barcode || null,
      categoryId: body.categoryId || null,
      price: body.price,
      cost: body.cost,
      imageEmoji: body.imageEmoji,
      trackStock: body.trackStock,
      minQty: body.minQty,
      isActive: body.isActive,
      variants: { create: body.variants.map((v) => ({ name: v.name, priceDelta: v.priceDelta })) },
      modifierGroups: {
        create: body.modifierGroups.map((g) => ({
          name: g.name,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          modifiers: { create: g.modifiers.map((m) => ({ name: m.name, priceDelta: m.priceDelta })) },
        })),
      },
    },
    include: { variants: true, modifierGroups: { include: { modifiers: true } } },
  });

  if (body.trackStock) {
    await prisma.stock.create({ data: { outletId: outlet.id, productId: produk.id, qty: 0, minQty: body.minQty } });
  }
  await catatAudit({
    tenantId,
    outletId: outlet.id,
    userId: sesi.userId,
    action: "PRODUCT_CREATE",
    entity: "Product",
    entityId: produk.id,
    after: { name: produk.name, price: produk.price },
  });

  return ok({ product: produk }, 201);
});
