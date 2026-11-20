import crypto from "node:crypto";
import {
  PayloadError,
  SignatureError,
  type ChargeInput,
  type ChargeResult,
  type NormalizedEvent,
  type PaymentProvider,
  type StatusEvent,
} from "./types";

/**
 * Provider `fake` untuk development & test.
 * Mensimulasikan QRIS/VA tanpa gateway sungguhan: signature HMAC-SHA256
 * dengan secret PAYMENT_FAKE_SECRET, dan endpoint dev untuk mengirim webhook.
 */

const RAHASIA = () => process.env.PAYMENT_FAKE_SECRET || "fake-secret-dev";

export function tandaTangan(body: string): string {
  return crypto.createHmac("sha256", RAHASIA()).update(body).digest("hex");
}

export class FakeProvider implements PaymentProvider {
  readonly name = "FAKE";

  async createCharge(input: ChargeInput): Promise<ChargeResult> {
    const menit = input.expiresInMinutes ?? 15;
    const ref = `fake_${input.method.toLowerCase()}_${crypto.randomBytes(6).toString("hex")}`;
    const expiresAt = new Date(Date.now() + menit * 60_000).toISOString();

    if (input.method === "VA") {
      return {
        providerRef: ref,
        vaNumber: "8808" + String(Math.floor(Math.random() * 1e12)).padStart(12, "0"),
        expiresAt,
      };
    }

    // String QR ringkas; bukan QR EMVCo valid, cukup untuk demo alur.
    const qrString = `00020101021226${ref}5204000053033605802ID5910KASIRKU6007BANDUNG54${String(
      input.amount,
    ).length}${input.amount}6304FAKE`;
    return {
      providerRef: ref,
      qrString,
      qrImageUrl: `/api/payments/qr?data=${encodeURIComponent(qrString)}`,
      expiresAt,
    };
  }

  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean {
    const signature = headers["x-fake-signature"];
    if (!signature) return false;
    const harap = tandaTangan(rawBody);
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(harap));
    } catch {
      return false;
    }
  }

  parseWebhook(rawBody: string): NormalizedEvent {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new PayloadError("Body webhook bukan JSON valid");
    }
    const status = String(data.status ?? "");
    const statusValid: StatusEvent[] = ["settlement", "pending", "expire", "deny", "refund"];
    if (!statusValid.includes(status as StatusEvent)) {
      throw new PayloadError(`Status webhook tidak dikenal: ${status}`);
    }
    if (!data.eventId || !data.providerRef || !data.orderId) {
      throw new PayloadError("Field eventId/providerRef/orderId wajib ada");
    }
    const amount = Number(data.amount ?? 0);
    if (!Number.isInteger(amount) || amount < 0) {
      throw new PayloadError("Nominal webhook tidak valid");
    }
    return {
      eventId: String(data.eventId),
      providerRef: String(data.providerRef),
      orderId: String(data.orderId),
      status: status as StatusEvent,
      amount,
      paidAt: data.paidAt ? String(data.paidAt) : undefined,
      method: String(data.method ?? "QRIS"),
    };
  }
}

export function signatureError(): SignatureError {
  return new SignatureError("Signature webhook tidak valid");
}
