import { z } from "zod";
import { bacaJson, ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { HttpError } from "@/lib/rbac";
import { tandaiLunas } from "@/lib/order-service";
import { catatAudit } from "@/lib/audit";

/**
 * Transfer manual: kasir upload bukti → status PENDING → manager verifikasi.
 * Tidak pernah otomatis lunas (PRD §8.1).
 */
const skemaBukti = z.object({
  // Foto bukti dikompres di browser lalu dikirim sebagai data URL (disk server gratisan tidak permanen).
  // Hanya gambar: mencegah URL javascript:/html dirender sebagai link.
  proofUrl: z
    .string()
    .max(1_500_000, "Foto bukti terlalu besar")
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Bukti harus berupa foto"),
  amount: z.number().int().positive(),
});


export const POST = route<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const { outlet } = await konteks("order.create");
  const body = skemaBukti.parse(await bacaJson(req));

  const order = await prisma.order.findFirst({ where: { id, outletId: outlet.id } });
  if (!order) throw new HttpError(404, "Order tidak ditemukan");
  if (order.status !== "DRAFT" && order.status !== "CONFIRMED") {
    throw new HttpError(409, "Order sudah dibayar atau ditutup");
  }

  const ada = await prisma.payment.findFirst({ where: { orderId: id, method: "MANUAL_TRANSFER", status: "PENDING" } });
  if (ada) throw new HttpError(409, "Bukti transfer untuk order ini sudah dikirim, tunggu verifikasi");

  const payment = await prisma.payment.create({
    data: {
      orderId: id,
      method: "MANUAL_TRANSFER",
      provider: "MANUAL",
      amount: body.amount,
      proofUrl: body.proofUrl,
      status: "PENDING",
    },
  });
  return ok({ payment }, 201);
});

const skemaVerifikasi = z.object({
  paymentId: z.string().min(1),
  setujui: z.boolean(),
});

/** Verifikasi oleh manager/owner. Lunas hanya lewat keputusan manusia + jalur tandaiLunas (struk otomatis). */
export const PATCH = route<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const { sesi, outlet, tenantId } = await konteks("order.void");
  const { paymentId, setujui } = skemaVerifikasi.parse(await bacaJson(req));

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, orderId: id, order: { outletId: outlet.id } },
    include: { order: { select: { grandTotal: true } } },
  });
  if (!payment) throw new HttpError(404, "Pembayaran tidak ditemukan");
  if (payment.method !== "MANUAL_TRANSFER") throw new HttpError(400, "Bukan pembayaran transfer manual");
  if (payment.status !== "PENDING") throw new HttpError(409, "Pembayaran ini sudah diverifikasi");

  const audit = (after: Record<string, unknown>) =>
    catatAudit({
      tenantId,
      outletId: outlet.id,
      userId: sesi.userId,
      action: "PAYMENT_MANUAL_VERIFY",
      entity: "Payment",
      entityId: paymentId,
      before: { status: payment.status, amount: payment.amount },
      after,
    });

  if (!setujui) {
    const ditolak = await prisma.payment.update({ where: { id: paymentId }, data: { status: "FAILED" } });
    await audit({ status: "FAILED", setujui: false });
    return ok({ payment: ditolak });
  }

  // Dicek di sini (bukan diserahkan ke tandaiLunas) karena HttpError di dalam transaksinya
  // ikut me-rollback penanda NEEDS_REVIEW.
  if (payment.amount !== payment.order.grandTotal) {
    await prisma.$transaction([
      prisma.payment.update({ where: { id: paymentId }, data: { status: "NEEDS_REVIEW" } }),
      prisma.order.update({ where: { id }, data: { needsReview: true } }),
    ]);
    await audit({ status: "NEEDS_REVIEW", setujui: true });
    throw new HttpError(409, "Nominal transfer tidak sama dengan total order, ditandai perlu review");
  }

  await tandaiLunas(paymentId, { amount: payment.amount });
  const lunas = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  await audit({ status: lunas.status, setujui: true });
  return ok({ payment: lunas });
});
