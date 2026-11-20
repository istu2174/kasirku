import "server-only";
import { FakeProvider } from "./fake";
import { MidtransProvider } from "./midtrans";
import type { PaymentProvider } from "./types";

export type { PaymentProvider } from "./types";
export { SignatureError, PayloadError } from "./types";

const daftar: Record<string, () => PaymentProvider> = {
  fake: () => new FakeProvider(),
  midtrans: () => new MidtransProvider(),
};

/** Provider aktif sesuai env PAYMENT_PROVIDER (default fake untuk lokal). */
export function providerAktif(): PaymentProvider {
  const nama = (process.env.PAYMENT_PROVIDER ?? "fake").toLowerCase();
  const buat = daftar[nama];
  if (!buat) throw new Error(`PAYMENT_PROVIDER tidak dikenal: ${nama}`);
  return buat();
}

/** Provider untuk memproses webhook masuk, ditentukan dari path/DB. */
export function providerUntuk(nama: string): PaymentProvider {
  const kunci = nama.toLowerCase();
  const buat = daftar[kunci];
  if (!buat) throw new Error(`Provider webhook tidak dikenal: ${nama}`);
  return buat();
}
