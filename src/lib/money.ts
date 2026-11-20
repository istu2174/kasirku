/**
 * Semua uang disimpan sebagai integer rupiah. Tidak ada float di jalur uang.
 * Urutan perhitungan mengikuti PRD §8.5:
 * subtotal → diskon item → diskon order → service → pajak → pembulatan → grand total.
 */

export type TaxConfig = {
  taxPercent: number; // mis. 10 untuk PB1 10%
  taxInclusive: boolean; // true = harga sudah termasuk pajak
  servicePercent: number; // mis. 5
  roundingTo: number; // 0 = tanpa pembulatan, 100 = kelipatan 100
  roundingMode?: RoundingMode; // default NEAREST
  taxName?: string; // label di struk: PB1 / PPN
};

export type RoundingMode = "NEAREST" | "UP" | "DOWN";

export const DEFAULT_TAX_CONFIG: TaxConfig = {
  taxPercent: 10,
  taxInclusive: false,
  servicePercent: 5,
  roundingTo: 100,
  roundingMode: "NEAREST",
  taxName: "PB1",
};

export type LineInput = {
  unitPrice: number; // harga satuan setelah varian
  modifierTotal?: number; // total modifier berbayar per unit
  qty: number;
  discount?: number; // diskon per baris (nominal total baris)
};

export type TotalsInput = {
  lines: LineInput[];
  orderDiscount?: number; // nominal diskon level bill
  config: TaxConfig;
};

export type Totals = {
  subtotal: number;
  itemDiscount: number;
  orderDiscount: number;
  service: number;
  tax: number;
  rounding: number;
  grandTotal: number;
};

const bulat = (n: number) => Math.round(n);

/** Subtotal = Σ (harga + modifier) × qty. Diskon item dipisah agar tampil di struk. */
export function hitungSubtotal(lines: LineInput[]): { subtotal: number; itemDiscount: number } {
  let subtotal = 0;
  let itemDiscount = 0;
  for (const line of lines) {
    const unit = line.unitPrice + (line.modifierTotal ?? 0);
    subtotal += unit * line.qty;
    itemDiscount += line.discount ?? 0;
  }
  return { subtotal, itemDiscount };
}

export function hitungTotal(input: TotalsInput): Totals {
  const { subtotal, itemDiscount } = hitungSubtotal(input.lines);
  const orderDiscount = Math.min(input.orderDiscount ?? 0, Math.max(subtotal - itemDiscount, 0));

  // Dasar setelah diskon, tidak pernah negatif.
  const dasar = Math.max(subtotal - itemDiscount - orderDiscount, 0);
  const service = bulat((dasar * input.config.servicePercent) / 100);

  let tax: number;
  if (input.config.taxInclusive) {
    // Pajak bagian dari harga: porsi pajak = dasar × p / (100 + p)
    const p = input.config.taxPercent;
    tax = p > 0 ? bulat((dasar * p) / (100 + p)) : 0;
  } else {
    tax = bulat(((dasar + service) * input.config.taxPercent) / 100);
  }

  const sebelumBulat = input.config.taxInclusive
    ? dasar + service // pajak sudah termasuk
    : dasar + service + tax;

  const langkah = Math.max(input.config.roundingTo ?? 0, 0);
  const fungsi = { NEAREST: Math.round, UP: Math.ceil, DOWN: Math.floor }[input.config.roundingMode ?? "NEAREST"];
  // Pembulatan hanya sekali, di langkah terakhir.
  const dibulatkan = langkah > 1 ? fungsi(sebelumBulat / langkah) * langkah : sebelumBulat;

  return {
    subtotal,
    itemDiscount,
    orderDiscount,
    service,
    tax,
    rounding: dibulatkan - sebelumBulat,
    grandTotal: Math.max(dibulatkan, 0),
  };
}

/** Kembalian cash. Uang kurang → error, bukan kembalian negatif. */
export function hitungKembalian(dibayar: number, total: number): number {
  if (!Number.isInteger(dibayar) || dibayar < 0) throw new Error("Nominal bayar tidak valid");
  if (dibayar < total) throw new Error("Uang yang diterima kurang dari total");
  return dibayar - total;
}

/** Parse taxConfig dari DB (string JSON) dengan fallback aman. */
export function parseTaxConfig(raw: string | null | undefined): TaxConfig {
  if (!raw) return DEFAULT_TAX_CONFIG;
  try {
    const parsed = JSON.parse(raw) as Partial<TaxConfig>;
    return {
      taxPercent: Number(parsed.taxPercent ?? DEFAULT_TAX_CONFIG.taxPercent),
      taxInclusive: Boolean(parsed.taxInclusive ?? DEFAULT_TAX_CONFIG.taxInclusive),
      servicePercent: Number(parsed.servicePercent ?? DEFAULT_TAX_CONFIG.servicePercent),
      roundingTo: Number(parsed.roundingTo ?? DEFAULT_TAX_CONFIG.roundingTo),
      roundingMode: (["NEAREST", "UP", "DOWN"] as const).includes(parsed.roundingMode as RoundingMode)
        ? (parsed.roundingMode as RoundingMode)
        : "NEAREST",
      taxName: String(parsed.taxName ?? DEFAULT_TAX_CONFIG.taxName),
    };
  } catch {
    return DEFAULT_TAX_CONFIG;
  }
}
