import { z } from "zod";
import { bacaJson, ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { verifikasiApprover } from "@/lib/auth";
import { catatAudit } from "@/lib/audit";
import { can, HttpError, type Role } from "@/lib/rbac";

export const GET = route(async (req) => {
  const { outlet } = await konteks();
  const hanyaKritis = new URL(req.url).searchParams.get("low") === "1";

  const stok = await prisma.stock.findMany({
    where: { outletId: outlet.id },
    include: { product: { include: { category: true } } },
    orderBy: { product: { name: "asc" } },
  });

  const data = stok
    .map((s) => ({
      id: s.id,
      productId: s.productId,
      name: s.product.name,
      emoji: s.product.imageEmoji,
      sku: s.product.sku,
      barcode: s.product.barcode,
      category: s.product.category?.name ?? "-",
      qty: s.qty,
      minQty: s.minQty,
      trackStock: s.product.trackStock,
      kritis: s.product.trackStock && s.qty <= s.minQty,
      oversold: s.qty < 0,
    }))
    .filter((s) => (hanyaKritis ? s.kritis : true));

  return ok({ stock: data });
});

const skema = z
  .object({
    productId: z.string(),
    type: z.enum(["IN", "OUT", "ADJUSTMENT"]).default("ADJUSTMENT"),
    // IN/OUT: qty positif; ADJUSTMENT: selisih bertanda (+ tambah, - kurang).
    qty: z.number().int().refine((n) => n !== 0, "Qty tidak boleh 0"),
    reason: z.string().trim().min(3, "Alasan penyesuaian wajib diisi"),
    // Wajib kalau yang mengajukan bukan Owner/Manager (mis. Staf Gudang).
    approver: z.object({ email: z.string().email(), pin: z.string().regex(/^\d{4,6}$/) }).optional(),
  })
  .refine((b) => b.type === "ADJUSTMENT" || b.qty > 0, { message: "Qty untuk IN/OUT harus positif", path: ["qty"] });

/** Penyesuaian stok manual (masuk/keluar/opname) dengan alasan + audit. */
export const POST = route(async (req) => {
  const { sesi, outlet, tenantId } = await konteks("stock.opname");
  const body = skema.parse(await bacaJson(req));

  let approverId = sesi.userId;
  if (!can(sesi.role, "order.void")) {
    if (!body.approver) throw new HttpError(403, "Penyesuaian stok butuh persetujuan Manager/Owner");
    approverId = await verifikasiApprover(body.approver.email, body.approver.pin, outlet.id);
  }

  const delta = body.type === "OUT" ? -body.qty : body.qty;

  const hasil = await prisma.$transaction(async (tx) => {
    const stok = await tx.stock.findUnique({
      where: { outletId_productId: { outletId: outlet.id, productId: body.productId } },
    });
    if (!stok) throw new HttpError(400, "Produk tidak melacak stok");
    if (delta < 0 && stok.qty + delta < 0) throw new HttpError(400, `Stok tidak cukup (sisa ${stok.qty})`);
    const baru = await tx.stock.update({ where: { id: stok.id }, data: { qty: { increment: delta } } });
    const movement = await tx.stockMovement.create({
      data: {
        outletId: outlet.id,
        productId: body.productId,
        type: body.type,
        qty: delta,
        note: body.reason,
        userId: sesi.userId,
        refType: "ADJUSTMENT",
      },
    });
    return { sebelum: stok.qty, stok: baru, movement };
  });

  await catatAudit({
    tenantId,
    outletId: outlet.id,
    userId: sesi.userId,
    action: "STOCK_ADJUST",
    entity: "Stock",
    entityId: hasil.stok.id,
    before: { qty: hasil.sebelum },
    after: { qty: hasil.stok.qty, tipe: body.type, alasan: body.reason, approverId },
  });

  return ok({ stok: hasil.stok, movement: hasil.movement });
});
