import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { tandaTangan } from "@/lib/payments/fake";
import { prosesWebhook } from "@/lib/payments/webhook-service";

// DB: prisma/data/test.db, dibuat ulang oleh global-setup sebelum test berjalan.

const REF_A = "fake_qris_test_a";
const REF_B = "fake_qris_test_b";
const ORDER_A = "ORD-TST-20261120-0001";
const ORDER_B = "ORD-TST-20261120-0002";

let orderAId = "";
let orderBId = "";

const kirim = (data: Record<string, unknown>, signature?: string) => {
  const body = JSON.stringify(data);
  return prosesWebhook("fake", body, { "x-fake-signature": signature ?? tandaTangan(body) });
};

const settlementA = {
  eventId: "evt_settle_a",
  providerRef: REF_A,
  orderId: ORDER_A,
  status: "settlement",
  amount: 92000,
  method: "QRIS",
  paidAt: "2026-11-20T03:00:00.000Z",
};

beforeAll(async () => {
  const tenant = await prisma.tenant.create({ data: { name: "Tenant Test", businessMode: "KAFE" } });
  const outlet = await prisma.outlet.create({
    data: {
      tenantId: tenant.id,
      code: "TST",
      name: "Outlet Test",
      address: "Jl. Test 1",
      phone: "0800",
      businessMode: "KAFE",
      taxConfig: JSON.stringify({ taxPercent: 10, taxInclusive: false, servicePercent: 5, roundingTo: 1000, roundingMode: "UP" }),
    },
  });
  const kasir = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      name: "Kasir Test",
      email: "kasir-test@kasirku.id",
      passwordHash: "x",
      outlets: { create: { outletId: outlet.id, role: "KASIR" } },
    },
  });
  const shift = await prisma.shift.create({ data: { outletId: outlet.id, userId: kasir.id, status: "OPEN" } });
  const produk = await prisma.product.create({
    data: { outletId: outlet.id, name: "Caffe Latte", sku: "LATTE", price: 23000 },
  });
  await prisma.stock.create({ data: { outletId: outlet.id, productId: produk.id, qty: 100 } });

  const buat = async (orderNo: string, ref: string, grandTotal: number) => {
    const order = await prisma.order.create({
      data: {
        outletId: outlet.id,
        orderNo,
        shiftId: shift.id,
        cashierId: kasir.id,
        status: "CONFIRMED",
        subtotal: grandTotal,
        grandTotal,
        items: {
          create: { productId: produk.id, nameSnapshot: produk.name, qty: 2, unitPrice: 23000, lineTotal: grandTotal },
        },
        payments: {
          create: { method: "QRIS", provider: "FAKE", providerRef: ref, amount: grandTotal, status: "PENDING" },
        },
      },
    });
    return order.id;
  };
  orderAId = await buat(ORDER_A, REF_A, 92000);
  orderBId = await buat(ORDER_B, REF_B, 46000);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("prosesWebhook (fake) terhadap DB nyata", () => {
  it("(a) signature salah → 401 dan tidak ada payment_events baru", async () => {
    const sebelum = await prisma.paymentEvent.count();
    const hasil = await kirim(settlementA, "0".repeat(64));
    expect(hasil.status).toBe(401);
    expect(await prisma.paymentEvent.count()).toBe(sebelum);

    const tanpaHeader = await prosesWebhook("fake", JSON.stringify(settlementA), {});
    expect(tanpaHeader.status).toBe(401);
    expect(await prisma.paymentEvent.count()).toBe(sebelum);
  });

  it("(b) settlement valid → 200, order PAID, tepat 1 struk SALE", async () => {
    const hasil = await kirim(settlementA);
    expect(hasil.status).toBe(200);
    expect(hasil.body).toMatchObject({ ok: true, paid: true });

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderAId } });
    expect(order.status).toBe("PAID");
    expect(await prisma.receipt.count({ where: { orderId: orderAId, kind: "SALE" } })).toBe(1);
  });

  it("(c) body yang sama dikirim ulang → 200 duplicate, tetap 1 struk & 1 payment PAID", async () => {
    const hasil = await kirim(settlementA);
    expect(hasil.status).toBe(200);
    expect(hasil.body).toMatchObject({ ok: true, duplicate: true });

    expect(await prisma.receipt.count({ where: { orderId: orderAId, kind: "SALE" } })).toBe(1);
    expect(await prisma.payment.count({ where: { orderId: orderAId, status: "PAID" } })).toBe(1);
    expect(await prisma.paymentEvent.count({ where: { providerEventId: settlementA.eventId } })).toBe(1);
  });

  it("(d) expire yang datang setelah settlement diabaikan", async () => {
    const hasil = await kirim({ ...settlementA, eventId: "evt_expire_a", status: "expire" });
    expect(hasil.status).toBe(200);
    expect(hasil.body).toMatchObject({ ok: true, ignored: "sudah lunas" });

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: orderAId } });
    expect(payment.status).toBe("PAID");
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderAId } });
    expect(order.status).toBe("PAID");
  });

  it("(e) nominal beda → NEEDS_REVIEW, order tidak PAID", async () => {
    const hasil = await kirim({
      eventId: "evt_settle_b_salah",
      providerRef: REF_B,
      orderId: ORDER_B,
      status: "settlement",
      amount: 40000,
    });
    expect(hasil.status).toBe(200);
    expect(hasil.body).toMatchObject({ needsReview: true });

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: orderBId } });
    expect(payment.status).toBe("NEEDS_REVIEW");
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderBId } });
    expect(order.status).not.toBe("PAID");
    expect(order.needsReview).toBe(true);
    expect(await prisma.receipt.count({ where: { orderId: orderBId } })).toBe(0);
  });

  it("(f) providerRef cocok tapi orderId beda → orphan_events, tidak menyentuh payment", async () => {
    const hasil = await kirim({ ...settlementA, eventId: "evt_orphan", orderId: ORDER_B });
    expect(hasil.status).toBe(200);
    expect(hasil.body).toMatchObject({ ok: true, orphan: true });

    expect(await prisma.orphanEvent.count({ where: { providerEventId: "evt_orphan" } })).toBe(1);
    expect(await prisma.paymentEvent.count({ where: { providerEventId: "evt_orphan" } })).toBe(0);

    // Retry gateway untuk orphan yang sama tidak menggandakan baris.
    await kirim({ ...settlementA, eventId: "evt_orphan", orderId: ORDER_B });
    expect(await prisma.orphanEvent.count({ where: { providerEventId: "evt_orphan" } })).toBe(1);
  });
});
