import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { MidtransProvider } from "@/lib/payments/midtrans";

const KEY = "SB-Mid-server-test";
process.env.MIDTRANS_SERVER_KEY = KEY;

function notif(status: string, extra: Record<string, unknown> = {}) {
  const base = {
    transaction_id: "trx-123",
    order_id: "ORD-CRB-20261120-0001~abc",
    status_code: status === "settlement" ? "200" : "201",
    gross_amount: "92000.00",
    transaction_status: status,
    payment_type: "qris",
    ...extra,
  };
  const sig = crypto
    .createHash("sha512")
    .update(`${base.order_id}${base.status_code}${base.gross_amount}${KEY}`)
    .digest("hex");
  return JSON.stringify({ ...base, signature_key: sig });
}

describe("MidtransProvider", () => {
  const p = new MidtransProvider();

  it("verifikasi signature SHA512 & tolak yang dirusak", () => {
    expect(p.verifyWebhook(notif("settlement"), {})).toBe(true);
    const rusak = JSON.parse(notif("settlement"));
    rusak.gross_amount = "1000.00";
    expect(p.verifyWebhook(JSON.stringify(rusak), {})).toBe(false);
  });

  it("pending & settlement dengan transaction_id sama punya eventId berbeda", () => {
    const a = p.parseWebhook(notif("pending"));
    const b = p.parseWebhook(notif("settlement"));
    expect(a.eventId).not.toBe(b.eventId);
    expect(b.status).toBe("settlement");
    expect(b.amount).toBe(92000);
  });

  it("suffix charge dibuang dari order_id", () => {
    expect(p.parseWebhook(notif("settlement")).orderId).toBe("ORD-CRB-20261120-0001");
  });
});
