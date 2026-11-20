/** Kontrak adapter payment gateway (PRD §8.2). */

export type MetodeCharge = "QRIS" | "VA" | "EWALLET";

export type ChargeInput = {
  orderId: string;
  orderNo: string;
  amount: number;
  method: MetodeCharge;
  customer?: { name?: string; email?: string; phone?: string };
  expiresInMinutes?: number;
};

export type ChargeResult = {
  providerRef: string;
  qrString?: string;
  qrImageUrl?: string;
  vaNumber?: string;
  expiresAt: string;
  raw?: unknown;
};

export type StatusEvent = "settlement" | "pending" | "expire" | "deny" | "refund";

export type NormalizedEvent = {
  eventId: string;
  providerRef: string;
  orderId: string;
  status: StatusEvent;
  amount: number;
  paidAt?: string;
  method: string;
};

export interface PaymentProvider {
  readonly name: string;
  createCharge(input: ChargeInput): Promise<ChargeResult>;
  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean;
  parseWebhook(rawBody: string): NormalizedEvent;
  /** Tanya status langsung ke gateway (rekonsiliasi saat webhook telat). Opsional. */
  cekStatus?(input: { orderNo: string; providerRef: string }): Promise<NormalizedEvent | null>;
}

export class SignatureError extends Error {}
export class PayloadError extends Error {}
