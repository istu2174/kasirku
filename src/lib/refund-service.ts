import "server-only";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/rbac";
import { catatAudit } from "@/lib/audit";
import { terbitkanStruk } from "@/lib/receipt";
import { enqueue } from "@/lib/queue";

/** Refund penuh/parsial ke metode asal. Butuh role Owner/Manager. */
export async function refundPayment(
  ctx: { outletId: string; userId: string; tenantId: string; approverId: string },
  paymentId: string,
  jumlah: number,
  alasan: string,
) {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, order: { outletId: ctx.outletId } },
    include: { order: { include: { items: { include: { product: true } } } }, refunds: true },
  });
  if (!payment) throw new HttpError(404, "Pembayaran tidak ditemukan");
  if (payment.status !== "PAID" && payment.status !== "REFUNDED") {
    throw new HttpError(409, "Pembayaran belum lunas, tidak bisa direfund");
  }

  const sudah = payment.refunds.reduce((s, r) => s + r.amount, 0);
  const sisa = payment.amount - sudah;
  if (jumlah <= 0 || jumlah > sisa) throw new HttpError(400, `Nominal refund maksimal ${sisa}`);

  const penuh = sudah + jumlah === payment.amount;

  const hasil = await prisma.$transaction(async (tx) => {
    const refund = await tx.refund.create({
      data: { paymentId, amount: jumlah, reason: alasan, approvedById: ctx.approverId },
    });

    await tx.payment.update({
      where: { id: paymentId },
      data: {
        refundedAmount: { increment: jumlah },
        status: penuh ? "REFUNDED" : "PAID",
      },
    });

    await tx.order.update({
      where: { id: payment.orderId },
      data: { status: penuh ? "REFUNDED" : "PARTIALLY_REFUNDED" },
    });

    // Stok kembali hanya untuk refund penuh (parsial butuh keputusan manual).
    if (penuh) {
      for (const item of payment.order.items) {
        if (!item.product.trackStock) continue;
        await tx.stock.update({
          where: { outletId_productId: { outletId: ctx.outletId, productId: item.productId } },
          data: { qty: { increment: item.qty } },
        });
        await tx.stockMovement.create({
          data: {
            outletId: ctx.outletId,
            productId: item.productId,
            type: "REFUND",
            qty: item.qty,
            refType: "ORDER",
            refId: payment.orderId,
            note: alasan,
          },
        });
      }
    }

    const struk = await terbitkanStruk(tx, payment.orderId, "REFUND", { amount: jumlah, reason: alasan });
    return { refund, struk };
  });

  await catatAudit({
    tenantId: ctx.tenantId,
    outletId: ctx.outletId,
    userId: ctx.userId,
    action: "PAYMENT_REFUND",
    entity: "Payment",
    entityId: paymentId,
    before: { status: payment.status, amount: payment.amount },
    after: { jumlah, penuh, alasan, approvedBy: ctx.approverId },
  });
  void enqueue("receipt.print", { receiptId: hasil.struk.id });

  return hasil;
}
