import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";

/**
 * Alur kasir end-to-end lewat API (butuh DB hasil `npm run db:seed`):
 * login → shift → order 2 Caffe Latte (Less Sugar, Extra Shot) + 1 Croissant meja 04
 * → bayar cash 100.000 → lalu order kedua dibayar QRIS via simulator webhook.
 */

type Modifier = { id: string; name: string };
type Produk = { id: string; name: string; modifierGroups: { modifiers: Modifier[] }[] };
type Meja = { id: string; name: string };
type Order = { id: string; grandTotal: number; status: string };

const RECEIPT_NO = /^CRB-\d{8}-\d{4}$/;

let api: APIRequestContext;
let itemOrder: { productId: string; qty: number; modifierIds: string[] }[] = [];
let mejaId = "";

async function json<T>(res: APIResponse): Promise<T> {
  const body = (await res.json()) as T;
  expect(res.ok(), `${res.url()} → ${res.status()} ${JSON.stringify(body)}`).toBe(true);
  return body;
}

async function buatOrder(): Promise<Order> {
  const { order } = await json<{ order: Order }>(
    await api.post("/api/orders", { data: { type: "DINE_IN", tableId: mejaId, items: itemOrder } }),
  );
  return order;
}

test.describe.serial("bayar di kasir", () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    api = await playwright.request.newContext({ baseURL });

    // Login sekali saja: route login membatasi 5 percobaan / 15 menit per email.
    const login = await json<{ outlet: { code: string } }>(
      await api.post("/api/auth/login", { data: { email: "kasir@kasirku.id", password: "kasir123" } }),
    );
    expect(login.outlet.code, "outlet default kasir harus kafe CRB").toBe("CRB");

    const { shift } = await json<{ shift: unknown }>(await api.get("/api/shifts"));
    if (!shift) await json(await api.post("/api/shifts", { data: { openingCash: 200000 } }));

    const { products } = await json<{ products: Produk[] }>(await api.get("/api/products"));
    const latte = products.find((p) => p.name === "Caffe Latte");
    const croissant = products.find((p) => p.name === "Croissant");
    expect(latte && croissant, "produk seed Caffe Latte & Croissant").toBeTruthy();
    const mods = latte!.modifierGroups.flatMap((g) => g.modifiers);
    const modId = (nama: string) => {
      const m = mods.find((x) => x.name === nama);
      expect(m, `modifier ${nama}`).toBeTruthy();
      return m!.id;
    };
    itemOrder = [
      { productId: latte!.id, qty: 2, modifierIds: [modId("Less Sugar"), modId("Extra Shot")] },
      { productId: croissant!.id, qty: 1, modifierIds: [] },
    ];

    const { tables } = await json<{ tables: Meja[] }>(await api.get("/api/tables"));
    const meja = tables.find((t) => t.name === "04");
    expect(meja, "meja 04").toBeTruthy();
    mejaId = meja!.id;
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("cash 100.000 → kembalian 8.000, PAID, struk terbit", async () => {
    const order = await buatOrder();
    expect(order.grandTotal).toBe(92000);

    const bayar = await json<{
      payment: { status: string };
      change: number;
      receipt: { receiptNo: string } | null;
    }>(
      await api.post(`/api/orders/${order.id}/payments/cash`, {
        data: { amountReceived: 100000, idempotencyKey: `e2e-${Date.now()}` },
      }),
    );
    expect(bayar.change).toBe(8000);
    expect(bayar.payment.status).toBe("PAID");
    expect(bayar.receipt?.receiptNo).toMatch(RECEIPT_NO);

    // Struk tercetak otomatis ≤ 3 detik setelah PAID (PRINT_MODE simulate menandai PRINTED).
    const id = (bayar.receipt as { id?: string } | null)?.id;
    await expect
      .poll(
        async () => {
          const r = await json<{ receipt: { jobs: { status: string }[] } }>(await api.get(`/api/receipts/${id}`));
          return r.receipt.jobs.some((j) => j.status === "PRINTED");
        },
        { timeout: 3000, intervals: [250] },
      )
      .toBe(true);
  });

  test("QRIS → simulasi settlement → polling sampai PAID", async () => {
    const order = await buatOrder();
    expect(order.grandTotal).toBe(92000);

    const charge = await json<{ paymentId: string; qrString?: string; amount: number }>(
      await api.post(`/api/orders/${order.id}/payments/charge`, { data: { method: "QRIS" } }),
    );
    expect(charge.amount).toBe(92000);
    expect(charge.qrString).toBeTruthy();

    const sim = await json<{ webhookStatus: number; paid?: boolean }>(
      await api.post("/api/dev/simulate", { data: { paymentId: charge.paymentId, status: "settlement" } }),
    );
    expect(sim.webhookStatus).toBe(200);

    await expect
      .poll(
        async () => {
          const s = await json<{ payment: { status: string }; receipt: { receiptNo: string } | null }>(
            await api.get(`/api/payments/${charge.paymentId}`),
          );
          return s.payment.status === "PAID" ? (s.receipt?.receiptNo ?? "") : s.payment.status;
        },
        { timeout: 15_000 },
      )
      .toMatch(RECEIPT_NO);
  });
});
