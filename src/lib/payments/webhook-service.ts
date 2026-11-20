import "server-only";
import { prisma } from "@/lib/db";
import { providerUntuk } from "@/lib/payments";
import { PayloadError, SignatureError } from "@/lib/payments/types";
import { tandaiExpired, tandaiLunas } from "@/lib/order-service";
import { enqueue } from "@/lib/queue";

export type HasilWebhook = { status: number; body: Record<string, unknown> };

/**
 * Inti handler webhook (dipakai route publik & simulator dev).
 * Aturan PRD §8.4: verifikasi signature, idempotensi event, balas cepat,
 * matching order, validasi nominal, out-of-order guard, simpan raw payload.
 */
export async function prosesWebhook(
  namaProvider: string,
  rawBody: string,
  headers: Record<string, string>,
): Promise<HasilWebhook> {
  let provider;
  try {
    provider = providerUntuk(namaProvider);
  } catch {
    return { status: 404, body: { error: "Provider tidak dikenal" } };
  }

  if (!provider.verifyWebhook(rawBody, headers)) {
    return { status: 401, body: { error: "Signature tidak valid" } };
  }

  let event;
  try {
    event = provider.parseWebhook(rawBody);
  } catch (err) {
    if (err instanceof PayloadError) return { status: 400, body: { error: err.message } };
    return { status: 400, body: { error: "Payload tidak valid" } };
  }

  // Idempotensi: event yang sama tidak diproses dua kali.
  const sudahAda = await prisma.paymentEvent.findUnique({
    where: { providerEventId: event.eventId },
  });
  if (sudahAda) return { status: 200, body: { ok: true, duplicate: true } };

  // Matching wajib cocok dua-duanya: provider_ref DAN order_id (nomor order).
  const payment = await prisma.payment.findFirst({
    where: { providerRef: event.providerRef, provider: provider.name, order: { orderNo: event.orderId } },
    include: { order: true },
  });

  if (!payment) {
    // Jangan dibuang: simpan untuk rekonsiliasi manual. Upsert supaya retry gateway tidak dobel.
    const ada = await prisma.orphanEvent.findFirst({ where: { providerEventId: event.eventId } });
    if (!ada) {
      await prisma.orphanEvent.create({
        data: {
          provider: provider.name,
          providerEventId: event.eventId,
          payload: rawBody,
          reason: `Order ${event.orderId} / ref ${event.providerRef} tidak ditemukan`,
        },
      });
    }
    return { status: 200, body: { ok: true, orphan: true } };
  }

  // Klaim event (unique index) sebelum efek samping apa pun.
  try {
    await prisma.paymentEvent.create({
      data: {
        paymentId: payment.id,
        providerEventId: event.eventId,
        provider: provider.name,
        status: event.status,
        amount: event.amount,
        payload: rawBody,
        headers: JSON.stringify(headers),
        verified: true,
      },
    });
  } catch {
    return { status: 200, body: { ok: true, duplicate: true } };
  }

  // Out-of-order: expire setelah settlement diabaikan.
  if (event.status === "expire" && payment.status === "PAID") {
    return { status: 200, body: { ok: true, ignored: "sudah lunas" } };
  }

  if (event.status === "settlement") {
    if (event.amount !== payment.order.grandTotal) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "NEEDS_REVIEW", amountReceived: event.amount },
      });
      await prisma.order.update({ where: { id: payment.orderId }, data: { needsReview: true } });
      // Alert ke manager: tampil di dashboard (orders.needsReview) + job notifikasi.
      void enqueue("notification.push", {
        type: "PAYMENT_AMOUNT_MISMATCH",
        orderNo: payment.order.orderNo,
        expected: payment.order.grandTotal,
        received: event.amount,
      });
      return { status: 200, body: { ok: true, needsReview: true, reason: "nominal tidak cocok" } };
    }
    await tandaiLunas(payment.id, {
      amount: event.amount,
      paidAt: event.paidAt ? new Date(event.paidAt) : new Date(),
      eventId: event.eventId,
    });
    return { status: 200, body: { ok: true, paid: true } };
  }

  if (event.status === "expire") {
    await tandaiExpired(payment.id);
    return { status: 200, body: { ok: true, expired: true } };
  }

  if (event.status === "deny") {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    return { status: 200, body: { ok: true, denied: true } };
  }

  return { status: 200, body: { ok: true, status: event.status } };
}
