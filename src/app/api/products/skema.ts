import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/rbac";

/** Skema varian & modifier bersama untuk POST /api/products dan PATCH /api/products/[id]. */
export const skemaVarian = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Nama varian wajib diisi"),
  priceDelta: z.number().int(),
});

export const skemaGrupModifier = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1, "Nama grup modifier wajib diisi"),
    minSelect: z.number().int().nonnegative().default(0),
    maxSelect: z.number().int().positive().default(1),
    modifiers: z
      .array(
        z.object({
          id: z.string().optional(),
          name: z.string().trim().min(1, "Nama modifier wajib diisi"),
          priceDelta: z.number().int(),
        }),
      )
      .default([]),
  })
  .refine((g) => g.minSelect <= g.maxSelect, { message: "Min pilih tidak boleh melebihi max pilih" });

/** SKU & barcode unik per outlet; cek dulu supaya pesan error jelas (bukan error Prisma). */
export async function cekUnik(outletId: string, sku: string | undefined, barcode: string | null | undefined, kecualiId?: string) {
  const bukanIni = kecualiId ? { id: { not: kecualiId } } : {};
  if (sku && (await prisma.product.findFirst({ where: { outletId, sku, ...bukanIni } }))) {
    throw new HttpError(409, `SKU ${sku} sudah dipakai produk lain`);
  }
  if (barcode && (await prisma.product.findFirst({ where: { outletId, barcode, ...bukanIni } }))) {
    throw new HttpError(409, `Barcode ${barcode} sudah dipakai produk lain`);
  }
}

export async function cekKategori(outletId: string, categoryId: string | null | undefined) {
  if (categoryId && !(await prisma.category.findFirst({ where: { id: categoryId, outletId } }))) {
    throw new HttpError(400, "Kategori tidak ditemukan di outlet ini");
  }
}

/** Sinkronkan varian: yang ber-id diubah, tanpa id dibuat, yang hilang dihapus (kecuali sudah dipakai transaksi). */
export async function sinkronVarian(
  tx: Prisma.TransactionClient,
  productId: string,
  varian: z.infer<typeof skemaVarian>[],
) {
  const lama = await tx.productVariant.findMany({ where: { productId }, select: { id: true } });
  const dipertahankan = new Set(varian.flatMap((v) => (v.id ? [v.id] : [])));
  const hapus = lama.map((v) => v.id).filter((id) => !dipertahankan.has(id));
  if (hapus.length) {
    if (await tx.orderItem.count({ where: { variantId: { in: hapus } } })) {
      throw new HttpError(409, "Varian yang sudah dipakai transaksi tidak bisa dihapus");
    }
    await tx.productVariant.deleteMany({ where: { id: { in: hapus } } });
  }
  for (const v of varian) {
    if (v.id) {
      await tx.productVariant.updateMany({
        where: { id: v.id, productId },
        data: { name: v.name, priceDelta: v.priceDelta },
      });
    } else {
      await tx.productVariant.create({ data: { productId, name: v.name, priceDelta: v.priceDelta } });
    }
  }
}

export async function sinkronModifier(
  tx: Prisma.TransactionClient,
  productId: string,
  grup: z.infer<typeof skemaGrupModifier>[],
) {
  const lamaGrup = await tx.modifierGroup.findMany({ where: { productId }, include: { modifiers: true } });
  const grupDipertahankan = new Set(grup.flatMap((g) => (g.id ? [g.id] : [])));
  const modDipertahankan = new Set(grup.flatMap((g) => g.modifiers.flatMap((m) => (m.id ? [m.id] : []))));

  const hapusMod = lamaGrup.flatMap((g) => g.modifiers.map((m) => m.id)).filter((id) => !modDipertahankan.has(id));
  if (hapusMod.length) {
    if (await tx.orderItemModifier.count({ where: { modifierId: { in: hapusMod } } })) {
      throw new HttpError(409, "Modifier yang sudah dipakai transaksi tidak bisa dihapus");
    }
    await tx.modifier.deleteMany({ where: { id: { in: hapusMod } } });
  }

  for (const g of grup) {
    let groupId = g.id;
    if (groupId) {
      await tx.modifierGroup.updateMany({
        where: { id: groupId, productId },
        data: { name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect },
      });
    } else {
      groupId = (
        await tx.modifierGroup.create({
          data: { productId, name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect },
        })
      ).id;
    }
    for (const m of g.modifiers) {
      if (m.id) {
        await tx.modifier.updateMany({
          where: { id: m.id, group: { productId } },
          data: { name: m.name, priceDelta: m.priceDelta, groupId },
        });
      } else {
        await tx.modifier.create({ data: { groupId, name: m.name, priceDelta: m.priceDelta } });
      }
    }
  }

  // Grup yang dihapus: modifier-nya sudah terhapus di atas (atau sudah dipindah), baru grupnya.
  const hapusGrup = lamaGrup.map((g) => g.id).filter((id) => !grupDipertahankan.has(id));
  if (hapusGrup.length) await tx.modifierGroup.deleteMany({ where: { id: { in: hapusGrup } } });
}
