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
 * Adapter Midtrans (sandbox/production) via Core API /v2/charge.
 * Signature webhook: SHA512(order_id + status_code + gross_amount + server_key)
 * sesuai dokumentasi Midtrans HTTP notification.
 */
export class MidtransProvider implements PaymentProvider {
  readonly name = "MIDTRANS";
  private serverKey = process.env.MIDTRANS_SERVER_KEY ?? "";
  private produksi = process.env.MIDTRANS_IS_PRODUCTION === "true";

  private base() {
    return this.produksi ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
  }

  private auth() {
    return "Basic " + Buffer.from(`${this.serverKey}:`).toString("base64");
  }

  async createCharge(input: ChargeInput): Promise<ChargeResult> {
    if (!this.serverKey) throw new Error("MIDTRANS_SERVER_KEY belum diisi");

    const body: Record<string, unknown> = {
      // Midtrans menolak order_id kembar; suffix "~" membuat tiap charge (termasuk regenerate) unik.
      transaction_details: { order_id: `${input.orderNo}~${Date.now().toString(36)}`, gross_amount: input.amount },
      customer_details: input.customer,
    };

    if (input.method === "QRIS") {
      body.payment_type = "qris";
      body.qris = { acquirer: "gopay" };
    } else if (input.method === "VA") {
      body.payment_type = "bank_transfer";
      body.bank_transfer = { bank: "bca" };
    } else {
      body.payment_type = "gopay";
    }

    const res = await fetch(`${this.base()}/v2/charge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: this.auth(),
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(`Midtrans menolak charge: ${String(data.status_message ?? res.status)}`);
    }

    const actions = (data.actions as Array<{ name: string; url: string }> | undefined) ?? [];
    const qrAction = actions.find((a) => a.name === "generate-qr-code");
    const vaNumbers = data.va_numbers as Array<{ va_number: string }> | undefined;

    return {
      providerRef: String(data.transaction_id ?? ""),
      qrString: typeof data.qr_string === "string" ? data.qr_string : undefined,
      qrImageUrl: qrAction?.url,
      vaNumber: vaNumbers?.[0]?.va_number,
      expiresAt: new Date(Date.now() + (input.expiresInMinutes ?? 15) * 60_000).toISOString(),
      raw: data,
    };
  }

  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean {
    if (!this.serverKey) return false;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return false;
    }
    const signature = String(data.signature_key ?? "");
    if (!signature) return false;

    const bahan = `${data.order_id ?? ""}${data.status_code ?? ""}${data.gross_amount ?? ""}${this.serverKey}`;
    const harap = crypto.createHash("sha512").update(bahan).digest("hex");

    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(harap));
    } catch {
      return false;
    }
  }

  async cekStatus(input: { orderNo: string; providerRef: string }): Promise<NormalizedEvent | null> {
    if (!this.serverKey) return null;
    // Panggilan server→gateway terautentikasi (Basic auth server key), jadi hasilnya dipercaya.
    const res = await fetch(`${this.base()}/v2/${encodeURIComponent(input.providerRef)}/status`, {
      headers: { Accept: "application/json", Authorization: this.auth() },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const ev = this.parseWebhook(await res.text());
    return ev.providerRef === input.providerRef ? ev : null;
  }

  parseWebhook(rawBody: string): NormalizedEvent {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new PayloadError("Body webhook bukan JSON valid");
    }

    const map: Record<string, StatusEvent> = {
      settlement: "settlement",
      capture: "settlement",
      pending: "pending",
      expire: "expire",
      deny: "deny",
      cancel: "deny",
      failure: "deny",
      refund: "refund",
    };
    const status = map[String(data.transaction_status ?? "")];
    if (!status) throw new PayloadError("Status Midtrans tidak dikenal");

    const amount = Math.round(Number(data.gross_amount ?? 0));
    if (!Number.isFinite(amount)) throw new PayloadError("Nominal tidak valid");

    return {
      // transaction_id sama untuk pending & settlement → gabung dengan status supaya tiap transisi unik.
      eventId: `${String(data.transaction_id ?? data.order_id)}:${String(data.transaction_status)}`,
      providerRef: String(data.transaction_id ?? ""),
      orderId: String(data.order_id ?? "").split("~")[0], // buang suffix charge → nomor order kita
      status,
      amount,
      paidAt: data.settlement_time ? String(data.settlement_time).replace(" ", "T") : undefined,
      method: String(data.payment_type ?? "QRIS"),
    };
  }
}

export function midtransSignatureError() {
  return new SignatureError("Signature Midtrans tidak valid");
}
