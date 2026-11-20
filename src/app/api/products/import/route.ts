import { z } from "zod";
import { ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { catatAudit } from "@/lib/audit";
import { HttpError } from "@/lib/rbac";
import { csvKeObjek } from "./csv";

const angkaBulat = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^-?\d+$/, `${label} harus bilangan bulat rupiah/qty`)
    .transform(Number);

const bool = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => ["", "1", "0", "true", "false", "ya", "tidak", "y", "n"].includes(v), "trackStock harus 1/0 atau true/false")
  .transform((v) => (v === "" ? true : ["1", "true", "ya", "y"].includes(v)));

const skemaBaris = z.object({
  name: z.string().trim().min(2, "name minimal 2 karakter"),
  sku: z.string().trim().min(2, "sku minimal 2 karakter"),
  barcode: z.string().trim().default("").transform((v) => v || null),
  category: z.string().trim().default(""),
  price: angkaBulat("price").pipe(z.number().nonnegative()),
  cost: z.string().trim().default("0").transform((v) => v || "0").pipe(angkaBulat("cost")).pipe(z.number().nonnegative()),
  emoji: z.string().trim().default("").transform((v) => v || "🍽️"),
  trackStock: z.string().default("").pipe(bool),
  minQty: z.string().trim().default("0").transform((v) => v || "0").pipe(angkaBulat("minQty")).pipe(z.number().nonnegative()),
  stock: z.string().trim().default("").transform((v, c) => {
    if (v === "") return null;
    if (!/^-?\d+$/.test(v)) {
      c.addIssue({ code: z.ZodIssueCode.custom, message: "stock harus bilangan bulat" });
      return z.NEVER;
    }
    return Number(v);
  }),
});

const skemaJson = z.object({ rows: z.array(z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))).max(5000) });

/**
 * Import produk dari CSV (text/csv) atau JSON {rows}. Kolom:
 * name,sku,barcode,category,price,cost,emoji,trackStock,minQty,stock.
 * Upsert per outlet+sku; baris gagal dilaporkan, baris lain tetap diproses.
 */
export const POST = route(async (req) => {
  const { sesi, outlet, tenantId } = await konteks("product.edit");

  let mentah: Record<string, string>[];
  if ((req.headers.get("content-type") ?? "").includes("text/csv")) {
    try {
      mentah = csvKeObjek(await req.text());
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : "CSV tidak valid");
    }
  } else {
    const body = skemaJson.parse(await req.json().catch(() => ({})));
    mentah = body.rows.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), v === null ? "" : String(v)])),
    );
  }
  if (mentah.length === 0) throw new HttpError(400, "Tidak ada baris data");
  if (mentah.length > 5000) throw new HttpError(400, "Maksimal 5000 baris per import");

  const kategori = new Map(
    (await prisma.category.findMany({ where: { outletId: outlet.id } })).map((c) => [c.name.toLowerCase(), c.id]),
  );
  const gagal: { baris: number; sku: string; error: string }[] = [];
  let dibuat = 0;
  let diubah = 0;

  for (const [i, r] of mentah.entries()) {
    const nomor = i + 2; // +1 header, +1 karena baris dihitung dari 1
    const cek = skemaBaris.safeParse(r);
    if (!cek.success) {
      gagal.push({ baris: nomor, sku: r.sku ?? "", error: cek.error.issues.map((x) => x.message).join("; ") });
      continue;
    }
    const d = cek.data;
    try {
      let categoryId: string | null = null;
      if (d.category) {
        categoryId = kategori.get(d.category.toLowerCase()) ?? null;
        if (!categoryId) {
          const baru = await prisma.category.create({
            data: { outletId: outlet.id, name: d.category, sortOrder: kategori.size },
          });
          categoryId = baru.id;
          kategori.set(d.category.toLowerCase(), baru.id);
        }
      }
      if (d.barcode) {
        const bentrok = await prisma.product.findFirst({
          where: { outletId: outlet.id, barcode: d.barcode, NOT: { sku: d.sku } },
        });
        if (bentrok) throw new Error(`Barcode ${d.barcode} sudah dipakai ${bentrok.sku}`);
      }

      const lama = await prisma.product.findUnique({ where: { outletId_sku: { outletId: outlet.id, sku: d.sku } } });
      const data = {
        name: d.name,
        barcode: d.barcode,
        categoryId,
        price: d.price,
        cost: d.cost,
        imageEmoji: d.emoji,
        trackStock: d.trackStock,
        minQty: d.minQty,
      };

      await prisma.$transaction(async (tx) => {
        const p = await tx.product.upsert({
          where: { outletId_sku: { outletId: outlet.id, sku: d.sku } },
          update: data,
          create: { ...data, outletId: outlet.id, sku: d.sku },
        });
        if (!d.trackStock) return;
        const stok = await tx.stock.upsert({
          where: { outletId_productId: { outletId: outlet.id, productId: p.id } },
          update: { minQty: d.minQty },
          create: { outletId: outlet.id, productId: p.id, qty: 0, minQty: d.minQty },
        });
        if (d.stock !== null && d.stock !== stok.qty) {
          await tx.stock.update({ where: { id: stok.id }, data: { qty: d.stock } });
          await tx.stockMovement.create({
            data: {
              outletId: outlet.id,
              productId: p.id,
              type: "ADJUSTMENT",
              qty: d.stock - stok.qty,
              refType: "ADJUSTMENT",
              note: "Import CSV",
              userId: sesi.userId,
            },
          });
        }
      });

      if (lama && (lama.price !== d.price || lama.cost !== d.cost)) {
        await catatAudit({
          tenantId,
          outletId: outlet.id,
          userId: sesi.userId,
          action: "PRODUCT_PRICE_CHANGE",
          entity: "Product",
          entityId: lama.id,
          before: { price: lama.price, cost: lama.cost },
          after: { price: d.price, cost: d.cost, sumber: "import CSV" },
        });
      }
      if (lama) diubah++;
      else dibuat++;
    } catch (err) {
      gagal.push({ baris: nomor, sku: d.sku, error: err instanceof Error ? err.message : "Gagal menyimpan" });
    }
  }

  await catatAudit({
    tenantId,
    outletId: outlet.id,
    userId: sesi.userId,
    action: "PRODUCT_IMPORT",
    entity: "Product",
    entityId: outlet.id,
    after: { total: mentah.length, dibuat, diubah, gagal: gagal.length },
  });

  return ok({ total: mentah.length, dibuat, diubah, gagal });
});
