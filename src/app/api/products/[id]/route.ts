import { z } from "zod";
import { bacaJson, ok, route, type Ctx } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { catatAudit } from "@/lib/audit";
import { HttpError } from "@/lib/rbac";
import { cekKategori, cekUnik, sinkronModifier, sinkronVarian, skemaGrupModifier, skemaVarian } from "../skema";

const skema = z.object({
  name: z.string().trim().min(2).optional(),
  sku: z.string().trim().min(2).optional(),
  price: z.number().int().nonnegative().optional(),
  cost: z.number().int().nonnegative().optional(),
  categoryId: z.string().nullable().optional(),
  barcode: z.string().trim().nullable().optional(),
  imageEmoji: z.string().optional(),
  isActive: z.boolean().optional(),
  trackStock: z.boolean().optional(),
  minQty: z.number().int().nonnegative().optional(),
  variants: z.array(skemaVarian).optional(),
  modifierGroups: z.array(skemaGrupModifier).optional(),
});

export const PATCH = route<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const { sesi, outlet, tenantId } = await konteks("product.edit");
  const { variants, modifierGroups, ...body } = skema.parse(await bacaJson(req));

  const lama = await prisma.product.findFirst({ where: { id, outletId: outlet.id } });
  if (!lama) throw new HttpError(404, "Produk tidak ditemukan");
  const barcode = body.barcode === undefined ? undefined : body.barcode || null;
  await cekUnik(outlet.id, body.sku, barcode, id);
  await cekKategori(outlet.id, body.categoryId);

  const produk = await prisma.$transaction(async (tx) => {
    const hasil = await tx.product.update({
      where: { id },
      data: { ...body, barcode, categoryId: body.categoryId === undefined ? undefined : body.categoryId || null },
    });
    if (variants) await sinkronVarian(tx, id, variants);
    if (modifierGroups) await sinkronModifier(tx, id, modifierGroups);
    // Produk yang mulai dilacak stoknya butuh baris Stock; minQty ikut disinkronkan.
    if (hasil.trackStock) {
      await tx.stock.upsert({
        where: { outletId_productId: { outletId: outlet.id, productId: id } },
        update: body.minQty !== undefined ? { minQty: body.minQty } : {},
        create: { outletId: outlet.id, productId: id, qty: 0, minQty: hasil.minQty },
      });
    } else if (body.minQty !== undefined) {
      await tx.stock.updateMany({ where: { outletId: outlet.id, productId: id }, data: { minQty: body.minQty } });
    }
    return hasil;
  });

  const ubahHarga = produk.price !== lama.price || produk.cost !== lama.cost;
  await catatAudit({
    tenantId,
    outletId: outlet.id,
    userId: sesi.userId,
    action: ubahHarga ? "PRODUCT_PRICE_CHANGE" : "PRODUCT_UPDATE",
    entity: "Product",
    entityId: id,
    before: { name: lama.name, price: lama.price, cost: lama.cost, isActive: lama.isActive },
    after: { ...body, price: produk.price, cost: produk.cost, variants, modifierGroups },
  });

  return ok({ product: produk });
});

/** Hapus = nonaktifkan (riwayat transaksi tetap utuh). */
export const DELETE = route<{ id: string }>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const { sesi, outlet, tenantId } = await konteks("product.edit");

  const lama = await prisma.product.findFirst({ where: { id, outletId: outlet.id } });
  if (!lama) throw new HttpError(404, "Produk tidak ditemukan");

  await prisma.product.update({ where: { id }, data: { isActive: false } });
  await catatAudit({
    tenantId,
    outletId: outlet.id,
    userId: sesi.userId,
    action: "PRODUCT_DELETE",
    entity: "Product",
    entityId: id,
    before: { name: lama.name, isActive: lama.isActive },
    after: { isActive: false },
  });
  return ok({ ok: true });
});
