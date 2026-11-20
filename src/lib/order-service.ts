import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateKey } from "@/lib/format";
import { hitungKembalian, hitungTotal, parseTaxConfig } from "@/lib/money";
import { HttpError } from "@/lib/rbac";
import { terbitkanStruk } from "@/lib/receipt";
import { enqueue } from "@/lib/queue";
import { providerAktif } from "@/lib/payments";
import { catatAudit } from "@/lib/audit";
import { tandaiAdaCharge } from "@/lib/reconcile";

export type ItemInput = {
  productId: string;
  variantId?: string | null;
  qty: number;
  modifierIds?: string[];
  note?: string | null;
};

type Konteks = { outletId: string; userId: string };

// ── Nomor order ────────────────────────────────────────────────────────────────
async function nomorOrder(tx: Prisma.TransactionClient, outletId: string, kode: string, tz: string) {
  const key = dateKey(new Date(), tz);
  const jumlah = await tx.order.count({
    where: { outletId, orderNo: { startsWith: `ORD-${kode}-${key}-` } },
  });
  return `ORD-${kode}-${key}-${String(jumlah + 1).padStart(4, "0")}`;
}

// ── Susun item + total ─────────────────────────────────────────────────────────
async function susunItem(
  tx: Prisma.TransactionClient,
  outletId: string,
  items: ItemInput[],
): Promise<{ data: Prisma.OrderItemCreateWithoutOrderInput[]; lines: { unitPrice: number; modifierTotal: number; qty: number }[] }> {
  if (!items.length) throw new HttpError(400, "Order harus punya minimal satu item");

  const produk = await tx.product.findMany({
    where: { outletId, id: { in: items.map((i) => i.productId) } },
    include: { variants: true, modifierGroups: { include: { modifiers: true } } },
  });
  const peta = new Map(produk.map((p) => [p.id, p]));
  const data: Prisma.OrderItemCreateWithoutOrderInput[] = [];
  const lines: { unitPrice: number; modifierTotal: number; qty: number }[] = [];

  for (const item of items) {
    if (!Number.isInteger(item.qty) || item.qty <= 0) throw new HttpError(400, "Qty harus bilangan bulat positif");
    const p = peta.get(item.productId);
    if (!p || !p.isActive) throw new HttpError(400, "Produk tidak ditemukan atau nonaktif");

    const varian = item.variantId ? p.variants.find((v) => v.id === item.variantId) : undefined;
    if (item.variantId && !varian) throw new HttpError(400, "Varian tidak cocok dengan produk");

    const unitPrice = p.price + (varian?.priceDelta ?? 0);

    // Validasi modifier: harus milik produk ini dan memenuhi min/max per grup.
    const dipilih = (item.modifierIds ?? []).map((id) => {
      const grup = p.modifierGroups.find((g) => g.modifiers.some((m) => m.id === id));
      const mod = grup?.modifiers.find((m) => m.id === id);
      if (!grup || !mod) throw new HttpError(400, `Modifier tidak valid untuk ${p.name}`);
      return { grupId: grup.id, mod };
    });

    for (const grup of p.modifierGroups) {
      const jumlah = dipilih.filter((d) => d.grupId === grup.id).length;
      if (jumlah < grup.minSelect) throw new HttpError(400, `${grup.name} wajib dipilih minimal ${grup.minSelect}`);
      if (jumlah > grup.maxSelect) throw new HttpError(400, `${grup.name} maksimal ${grup.maxSelect} pilihan`);
    }

    const modifierTotal = dipilih.reduce((s, d) => s + d.mod.priceDelta, 0);
    const lineTotal = (unitPrice + modifierTotal) * item.qty;

    data.push({
      product: { connect: { id: p.id } },
      ...(varian ? { variant: { connect: { id: varian.id } } } : {}),
      nameSnapshot: varian ? `${p.name} (${varian.name})` : p.name,
      qty: item.qty,
      unitPrice,
      modifierTotal,
      lineTotal,
      note: item.note ?? null,
      modifiers: {
        create: dipilih.map((d) => ({
          modifier: { connect: { id: d.mod.id } },
          nameSnapshot: d.mod.name,
          priceDelta: d.mod.priceDelta,
        })),
      },
    });
    lines.push({ unitPrice, modifierTotal, qty: item.qty });
  }

  return { data, lines };
}

// ── Buat / ubah order ──────────────────────────────────────────────────────────
export async function buatOrder(
  ctx: Konteks,
  input: {
    type: "DINE_IN" | "TAKEAWAY" | "DELIVERY" | "WALK_IN";
    tableId?: string | null;
    guestCount?: number | null;
    note?: string | null;
    items: ItemInput[];
    clientRef?: string | null;
  },
) {
  const shift = await prisma.shift.findFirst({
    where: { outletId: ctx.outletId, status: "OPEN" },
  });
  if (!shift) throw new HttpError(400, "Shift belum dibuka. Buka shift dulu sebelum membuat order.");

  const outlet = await prisma.outlet.findUniqueOrThrow({ where: { id: ctx.outletId } });
  const config = parseTaxConfig(outlet.taxConfig);

  return prisma.$transaction(async (tx) => {
    const { data, lines } = await susunItem(tx, ctx.outletId, input.items);
    const total = hitungTotal({ lines, config });
    const no = await nomorOrder(tx, ctx.outletId, outlet.code, outlet.timezone);

    const order = await tx.order.create({
      data: {
        outletId: ctx.outletId,
        orderNo: no,
        type: input.type,
        tableId: input.tableId ?? null,
        shiftId: shift.id,
        cashierId: ctx.userId,
        guestCount: input.guestCount ?? null,
        note: input.note ?? null,
        clientRef: input.clientRef ?? null,
        subtotal: total.subtotal,
        discount: total.itemDiscount + total.orderDiscount,
        service: total.service,
        tax: total.tax,
        rounding: total.rounding,
        grandTotal: total.grandTotal,
        items: { create: data },
      },
      include: { items: true },
    });

    if (input.tableId) {
      await tx.diningTable.update({ where: { id: input.tableId }, data: { status: "TERISI" } });
    }

    return order;
  });
}

/** Ubah isi order selama belum dibayar (item ditimpa total, harga dihitung ulang). */
export async function ubahOrder(
  ctx: Konteks,
  orderId: string,
  input: { items?: ItemInput[]; note?: string | null; discount?: number },
) {
  const order = await prisma.order.findFirst({ where: { id: orderId, outletId: ctx.outletId } });
  if (!order) throw new HttpError(404, "Order tidak ditemukan");
  if (order.status === "PAID") throw new HttpError(409, "Order sudah dibayar, tidak bisa diubah");

  const outlet = await prisma.outlet.findUniqueOrThrow({ where: { id: ctx.outletId } });
  const config = parseTaxConfig(outlet.taxConfig);

  return prisma.$transaction(async (tx) => {
    if (input.items) {
      const { data, lines } = await susunItem(tx, ctx.outletId, input.items);
      await tx.orderItem.deleteMany({ where: { orderId } });
      for (const item of data) {
        await tx.orderItem.create({ data: { ...item, order: { connect: { id: orderId } } } });
      }
      const total = hitungTotal({ lines, orderDiscount: input.discount ?? 0, config });
      return tx.order.update({
        where: { id: orderId },
        data: {
          subtotal: total.subtotal,
          discount: total.itemDiscount + total.orderDiscount,
          service: total.service,
          tax: total.tax,
          rounding: total.rounding,
          grandTotal: total.grandTotal,
          note: input.note ?? order.note,
        },
        include: { items: { include: { modifiers: true } } },
      });
    }

    return tx.order.update({
      where: { id: orderId },
      data: { note: input.note ?? order.note },
      include: { items: { include: { modifiers: true } } },
    });
  });
}

export async function konfirmasiOrder(ctx: Konteks, orderId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, outletId: ctx.outletId } });
  if (!order) throw new HttpError(404, "Order tidak ditemukan");
  if (order.status === "PAID") throw new HttpError(409, "Order sudah dibayar");

  // Validasi stok saat confirm (PRD FR-INV-02 & kasus tepi oversell).
  const items = await prisma.orderItem.findMany({
    where: { orderId },
    include: { product: true },
  });
  const stok = await prisma.stock.findMany({
    where: { outletId: ctx.outletId, productId: { in: items.map((i) => i.productId) } },
  });
  const petaStok = new Map(stok.map((s) => [s.productId, s.qty]));

  const kurang = items.filter((i) => i.product.trackStock && (petaStok.get(i.productId) ?? 0) < i.qty);
  if (kurang.length) {
    throw new HttpError(
      409,
      `Stok kurang: ${kurang.map((i) => `${i.nameSnapshot} (sisa ${petaStok.get(i.productId) ?? 0})`).join(", ")}`,
    );
  }

  return prisma.order.update({
    where: { id: orderId },
    data: { status: "CONFIRMED", items: { updateMany: { where: {}, data: { kitchenStatus: "NEW" } } } },
    include: { items: true },
  });
}

export async function batalkanOrder(ctx: Konteks, orderId: string, alasan: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, outletId: ctx.outletId } });
  if (!order) throw new HttpError(404, "Order tidak ditemukan");
  if (order.status === "PAID") throw new HttpError(409, "Order sudah dibayar. Pakai void/refund.");

  const hasil = await prisma.order.update({
    where: { id: orderId },
    data: { status: "CANCELLED", closedAt: new Date(), note: alasan },
  });
  if (order.tableId) {
    await prisma.diningTable.update({ where: { id: order.tableId }, data: { status: "PERLU_DIBERSIHKAN" } });
  }
  await catatAudit({
    tenantId: (await prisma.outlet.findUniqueOrThrow({ where: { id: ctx.outletId } })).tenantId,
    outletId: ctx.outletId,
    userId: ctx.userId,
    action: "ORDER_CANCEL",
    entity: "Order",
    entityId: orderId,
    before: { status: order.status },
    after: { status: "CANCELLED", alasan },
  });
  return hasil;
}

// ── Pembayaran ─────────────────────────────────────────────────────────────────
async function finalisasiLunas(
  tx: Prisma.TransactionClient,
  paymentId: string,
  paidAt: Date,
): Promise<{ sudahLunas: boolean; orderId: string; receiptId?: string }> {
  const payment = await tx.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { order: { include: { items: { include: { product: true } } } } },
  });

  if (payment.status === "PAID") return { sudahLunas: true, orderId: payment.orderId };

  // Optimistic lock: hanya order yang belum lunas yang boleh bertransisi.
  const kunci = await tx.order.updateMany({
    where: { id: payment.orderId, status: { in: ["DRAFT", "CONFIRMED"] } },
    data: { status: "PAID", paidAt, closedAt: paidAt },
  });

  if (kunci.count === 0) {
    // Order sudah dibayar lewat jalur lain: jangan buat pembayaran kedua.
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: "FAILED", rawResponse: JSON.stringify({ catatan: "order sudah lunas" }) },
    });
    return { sudahLunas: true, orderId: payment.orderId };
  }

  await tx.payment.update({ where: { id: paymentId }, data: { status: "PAID", paidAt } });

  // Potong stok + catat mutasi.
  let oversold = false;
  for (const item of payment.order.items) {
    if (!item.product.trackStock) continue;
    const stok = await tx.stock.findUnique({
      where: { outletId_productId: { outletId: payment.order.outletId, productId: item.productId } },
    });
    const baru = (stok?.qty ?? 0) - item.qty;
    if (baru < 0) oversold = true;
    await tx.stock.upsert({
      where: { outletId_productId: { outletId: payment.order.outletId, productId: item.productId } },
      update: { qty: baru },
      create: { outletId: payment.order.outletId, productId: item.productId, qty: baru },
    });
    await tx.stockMovement.create({
      data: {
        outletId: payment.order.outletId,
        productId: item.productId,
        type: "SALE",
        qty: -item.qty,
        refType: "ORDER",
        refId: payment.orderId,
      },
    });
  }
  if (oversold) await tx.order.update({ where: { id: payment.orderId }, data: { oversold: true } });

  if (payment.order.tableId) {
    await tx.diningTable.update({
      where: { id: payment.order.tableId },
      data: { status: "PERLU_DIBERSIHKAN" },
    });
  }

  // Struk terbit otomatis di transaksi yang sama (nomor tidak bolong).
  const receipt = await terbitkanStruk(tx, payment.orderId, "SALE");
  return { sudahLunas: false, orderId: payment.orderId, receiptId: receipt.id };
}

export async function bayarCash(
  ctx: Konteks,
  orderId: string,
  amountReceived: number,
  idempotencyKey?: string,
) {
  const order = await prisma.order.findFirst({ where: { id: orderId, outletId: ctx.outletId } });
  if (!order) throw new HttpError(404, "Order tidak ditemukan");
  if (order.status === "PAID") throw new HttpError(409, "Order sudah dibayar");

  const shift = await prisma.shift.findFirst({ where: { outletId: ctx.outletId, status: "OPEN" } });
  if (!shift) throw new HttpError(400, "Shift belum dibuka");

  const kembalian = hitungKembalian(amountReceived, order.grandTotal);

  const hasil = await prisma.$transaction(async (tx) => {
    // Idempotency: request ganda dengan key sama tidak membuat payment baru.
    if (idempotencyKey) {
      const ada = await tx.payment.findFirst({
        where: { orderId, providerRef: `cash_${idempotencyKey}` },
        include: { order: true },
      });
      if (ada) return { payment: ada, change: ada.change ?? 0, sudahAda: true, receiptId: undefined };
    }

    const payment = await tx.payment.create({
      data: {
        orderId,
        method: "CASH",
        provider: "CASH",
        providerRef: idempotencyKey ? `cash_${idempotencyKey}` : `cash_${Date.now()}`,
        amount: order.grandTotal,
        amountReceived,
        change: kembalian,
        status: "UNPAID",
      },
    });

    const fin = await finalisasiLunas(tx, payment.id, new Date());
    // Kalah balapan dengan kasir lain / webhook: batalkan transaksi ini.
    if (fin.sudahLunas) throw new HttpError(409, "Order sudah dibayar");
    const bayar = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    return { payment: bayar, change: kembalian, sudahAda: fin.sudahLunas, receiptId: fin.receiptId };
  });

  if (hasil.receiptId) void enqueue("receipt.print", { receiptId: hasil.receiptId });

  return {
    payment: hasil.payment,
    change: hasil.change,
    receipt: hasil.receiptId
      ? await prisma.receipt.findUnique({ where: { id: hasil.receiptId } })
      : await prisma.receipt.findFirst({ where: { orderId, kind: "SALE" } }),
  };
}

export async function buatCharge(
  ctx: Konteks,
  orderId: string,
  method: "QRIS" | "VA",
  expiresInMinutes = 15,
) {
  const order = await prisma.order.findFirst({ where: { id: orderId, outletId: ctx.outletId } });
  if (!order) throw new HttpError(404, "Order tidak ditemukan");
  if (order.status === "PAID") throw new HttpError(409, "Order sudah dibayar");

  // Regenerate setelah expire: charge lama ditandai EXPIRED, charge baru pakai providerRef baru.
  await prisma.payment.updateMany({
    where: { orderId, status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });

  const provider = providerAktif();
  const charge = await provider.createCharge({
    orderId: order.id,
    orderNo: order.orderNo,
    amount: order.grandTotal,
    method,
    expiresInMinutes,
  });

  tandaiAdaCharge();
  const payment = await prisma.payment.create({
    data: {
      orderId,
      method,
      provider: provider.name,
      providerRef: charge.providerRef,
      amount: order.grandTotal,
      status: "PENDING",
      qrString: charge.qrString ?? null,
      qrImageUrl: charge.qrImageUrl ?? null,
      vaNumber: charge.vaNumber ?? null,
      expiresAt: new Date(charge.expiresAt),
      rawResponse: JSON.stringify(charge.raw ?? {}),
    },
  });

  return { payment, charge };
}

/** Dipakai webhook & polling. Idempotent. */
export async function tandaiLunas(
  paymentId: string,
  opts: { paidAt?: Date; eventId?: string; amount?: number } = {},
) {
  const hasil = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
    if (!payment) throw new HttpError(404, "Pembayaran tidak ditemukan");

    if (payment.status === "PAID") return { sudahLunas: true, orderId: payment.orderId, receiptId: undefined };

    // Nominal harus sama dengan grand total order; kalau beda jangan auto-paid.
    if (opts.amount !== undefined && opts.amount !== payment.order.grandTotal) {
      return { sudahLunas: false, orderId: payment.orderId, receiptId: undefined, mismatch: true };
    }

    return finalisasiLunas(tx, paymentId, opts.paidAt ?? new Date());
  });

  if ("mismatch" in hasil) {
    // Ditulis di luar transaksi supaya penanda review tidak ikut rollback.
    await prisma.payment.update({ where: { id: paymentId }, data: { status: "NEEDS_REVIEW" } });
    await prisma.order.update({ where: { id: hasil.orderId }, data: { needsReview: true } });
    throw new HttpError(409, "Nominal pembayaran tidak cocok, perlu review manager");
  }

  if (hasil.receiptId) void enqueue("receipt.print", { receiptId: hasil.receiptId });
  return hasil;
}

export async function tandaiExpired(paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new HttpError(404, "Pembayaran tidak ditemukan");
  if (payment.status === "PAID") return payment; // out-of-order guard
  return prisma.payment.update({ where: { id: paymentId }, data: { status: "EXPIRED" } });
}

/**
 * Sinkronisasi order cash yang dibuat saat offline. Idempotent lewat clientRef:
 * kirim ulang dengan clientRef sama → order & struk yang sama, tidak dobel.
 */
export async function sinkronOrderOffline(
  ctx: Konteks,
  input: {
    clientRef: string;
    type: "DINE_IN" | "TAKEAWAY" | "DELIVERY" | "WALK_IN";
    tableId?: string | null;
    note?: string | null;
    items: ItemInput[];
    amountReceived: number;
  },
) {
  let order = await prisma.order.findUnique({ where: { clientRef: input.clientRef } });
  if (order && order.outletId !== ctx.outletId) throw new HttpError(409, "clientRef dipakai outlet lain");
  if (!order) {
    try {
      order = await buatOrder(ctx, { ...input, note: input.note ?? "Order offline" });
    } catch (err) {
      // Dua sinkronisasi paralel dengan clientRef sama: yang kalah ambil order pemenang.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        order = await prisma.order.findUniqueOrThrow({ where: { clientRef: input.clientRef } });
      } else throw err;
    }
  }
  if (order.status === "PAID") {
    const receipt = await prisma.receipt.findFirst({ where: { orderId: order.id, kind: "SALE" } });
    return { order, receipt, change: input.amountReceived - order.grandTotal, duplicate: true };
  }
  const hasil = await bayarCash(ctx, order.id, input.amountReceived, `offline_${input.clientRef}`);
  return { order: { ...order, status: "PAID" }, receipt: hasil.receipt, change: hasil.change, duplicate: false };
}

// ── Shift ──────────────────────────────────────────────────────────────────────
export async function shiftAktif(outletId: string) {
  return prisma.shift.findFirst({
    where: { outletId, status: "OPEN" },
    include: { user: true },
  });
}

export async function bukaShift(ctx: Konteks, openingCash: number) {
  const ada = await shiftAktif(ctx.outletId);
  if (ada) throw new HttpError(409, `Shift masih terbuka oleh ${ada.user.name}`);
  if (!Number.isInteger(openingCash) || openingCash < 0) throw new HttpError(400, "Modal awal tidak valid");

  const shift = await prisma.shift.create({
    data: { outletId: ctx.outletId, userId: ctx.userId, openingCash },
  });
  const outlet = await prisma.outlet.findUniqueOrThrow({ where: { id: ctx.outletId } });
  await catatAudit({
    tenantId: outlet.tenantId,
    outletId: ctx.outletId,
    userId: ctx.userId,
    action: "SHIFT_OPEN",
    entity: "Shift",
    entityId: shift.id,
    after: { openingCash },
  });
  return shift;
}

export async function tutupShift(ctx: Konteks, shiftId: string, countedCash: number, note?: string) {
  const shift = await prisma.shift.findFirst({ where: { id: shiftId, outletId: ctx.outletId } });
  if (!shift) throw new HttpError(404, "Shift tidak ditemukan");
  if (shift.status === "CLOSED") throw new HttpError(409, "Shift sudah ditutup");

  const tutupPada = new Date();
  const [cash, refundCash] = await Promise.all([
    prisma.payment.aggregate({
      where: { status: { in: ["PAID", "REFUNDED"] }, method: "CASH", order: { shiftId } },
      _sum: { amount: true },
    }),
    // Uang tunai keluar dari laci selama jam shift ini, termasuk refund order shift lain.
    prisma.refund.aggregate({
      where: {
        createdAt: { gte: shift.openedAt, lte: tutupPada },
        payment: { method: "CASH", order: { outletId: ctx.outletId } },
      },
      _sum: { amount: true },
    }),
  ]);
  const expectedCash = shift.openingCash + (cash._sum.amount ?? 0) - (refundCash._sum.amount ?? 0);
  const difference = countedCash - expectedCash;

  const hasil = await prisma.shift.update({
    where: { id: shiftId },
    data: {
      status: "CLOSED",
      closedAt: tutupPada,
      expectedCash,
      countedCash,
      difference,
      note: note ?? null,
    },
  });

  const outlet = await prisma.outlet.findUniqueOrThrow({ where: { id: ctx.outletId } });
  await catatAudit({
    tenantId: outlet.tenantId,
    outletId: ctx.outletId,
    userId: ctx.userId,
    action: "SHIFT_CLOSE",
    entity: "Shift",
    entityId: shiftId,
    before: { status: "OPEN" },
    after: { expectedCash, countedCash, difference },
  });
  return hasil;
}
