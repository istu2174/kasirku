import "server-only";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { dateKey } from "@/lib/format";
import { teksStruk, type ReceiptPayload } from "@/lib/struk";
import { parseTaxConfig } from "@/lib/money";

export type { ReceiptPayload, StrukItem } from "@/lib/struk";

/** Nomor struk: {KODE}-{YYYYMMDD}-{0001}, urut per outlet per hari. */
export async function ambilNomorStruk(
  tx: Prisma.TransactionClient,
  outletId: string,
  kode: string,
  timezone: string,
): Promise<string> {
  const key = dateKey(new Date(), timezone);
  const seq = await tx.receiptSequence.upsert({
    where: { outletId_dateKey: { outletId, dateKey: key } },
    update: { lastSeq: { increment: 1 } },
    create: { outletId, dateKey: key, lastSeq: 1 },
  });
  return `${kode}-${key}-${String(seq.lastSeq).padStart(4, "0")}`;
}

type OrderLengkap = Prisma.OrderGetPayload<{
  include: {
    items: { include: { modifiers: true } };
    outlet: true;
    cashier: true;
    table: true;
    payments: true;
  };
}>;

export function susunPayload(
  order: OrderLengkap,
  receiptNo: string,
  kind: ReceiptPayload["kind"],
  digitalToken: string,
): ReceiptPayload {
  const bayar = order.payments.find((p) => p.status === "PAID") ?? order.payments[0];
  const cfg = parseTaxConfig(order.outlet.taxConfig);
  const rc = (() => {
    try {
      return JSON.parse(order.outlet.receiptConfig) as { footer?: string; header?: string };
    } catch {
      return { footer: "Terima kasih atas kunjungan Anda" };
    }
  })();
  const footer = String(rc.footer ?? "");

  return {
    receiptNo,
    kind,
    issuedAt: new Date().toISOString(),
    outlet: {
      name: order.outlet.name,
      address: order.outlet.address,
      phone: order.outlet.phone,
      code: order.outlet.code,
    },
    orderNo: order.orderNo,
    orderType: order.type,
    tableName: order.table?.name ?? null,
    cashier: order.cashier.name,
    items: order.items.map((i) => ({
      name: i.nameSnapshot,
      qty: i.qty,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
      modifiers: i.modifiers.map((m) => ({ name: m.nameSnapshot, priceDelta: m.priceDelta })),
      note: i.note,
    })),
    subtotal: order.subtotal,
    itemDiscount: order.discount,
    orderDiscount: 0,
    service: order.service,
    serviceLabel: `Service ${cfg.servicePercent}%`,
    tax: order.tax,
    taxLabel: `${cfg.taxName ?? "Pajak"} ${cfg.taxPercent}%${cfg.taxInclusive ? " (termasuk)" : ""}`,
    rounding: order.rounding,
    grandTotal: order.grandTotal,
    payment: {
      method: bayar?.method ?? "CASH",
      amount: bayar?.amount ?? order.grandTotal,
      amountReceived: bayar?.amountReceived ?? null,
      change: bayar?.change ?? null,
    },
    header: rc.header ? String(rc.header) : undefined,
    footer,
    digitalUrl: `/r/${digitalToken}`,
  };
}

/** Terbitkan struk + print job. Idempotent: satu order = satu struk SALE. */
export async function terbitkanStruk(
  tx: Prisma.TransactionClient,
  orderId: string,
  kind: ReceiptPayload["kind"] = "SALE",
  refund?: { amount: number; reason: string },
) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      items: { include: { modifiers: true } },
      outlet: true,
      cashier: true,
      table: true,
      payments: true,
    },
  });

  if (kind === "SALE") {
    const sudah = await tx.receipt.findFirst({ where: { orderId, kind: "SALE" } });
    if (sudah) return sudah;
  }

  const receiptNo = await ambilNomorStruk(tx, order.outletId, order.outlet.code, order.outlet.timezone);
  const digitalToken = crypto.randomBytes(16).toString("hex");
  const payload = {
    ...susunPayload(order, receiptNo, kind, digitalToken),
    ...(refund ? { refundAmount: refund.amount, refundReason: refund.reason } : {}),
  };

  const receipt = await tx.receipt.create({
    data: {
      orderId,
      outletId: order.outletId,
      receiptNo,
      kind,
      digitalToken,
      payloadJson: JSON.stringify(payload),
      isOriginal: kind === "SALE",
    },
  });

  await tx.printJob.create({ data: { receiptId: receipt.id, status: "QUEUED" } });

  return receipt;
}

/** PDF struk (A6-ish, monospace) untuk salinan digital / unduh. */
export async function pdfStruk(p: ReceiptPayload): Promise<Uint8Array> {
  const lebar = 226; // ~80mm
  const teks = teksStruk(p, 48);
  const baris = teks.split("\n");
  const tinggi = Math.max(300, 40 + baris.length * 10);

  const doc = await PDFDocument.create();
  const page = doc.addPage([lebar, tinggi]);
  const font = await doc.embedFont(StandardFonts.Courier);
  let y = tinggi - 20;
  for (const b of baris) {
    page.drawText(b, { x: 10, y, size: 7, font, color: rgb(0, 0, 0) });
    y -= 9.5;
  }
  return doc.save();
}
