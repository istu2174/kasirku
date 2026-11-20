import { describe, expect, it } from "vitest";
import { hitungKembalian, hitungTotal, type TaxConfig, type Totals } from "@/lib/money";

const PRD: TaxConfig = { taxPercent: 10, taxInclusive: false, servicePercent: 5, roundingTo: 1000, roundingMode: "UP" };

// 2× Caffe Latte @23.000 + Extra Shot @4.000/cup, 1 Croissant @25.000
const linesPrd = [
  { unitPrice: 23000, modifierTotal: 4000, qty: 2 },
  { unitPrice: 25000, qty: 1 },
];

const semuaInteger = (t: Totals) => Object.values(t).every((v) => Number.isInteger(v));

describe("hitungTotal", () => {
  it("kasus PRD: service → pajak → pembulatan UP ke 1.000", () => {
    const t = hitungTotal({ lines: linesPrd, config: PRD });
    expect(t).toMatchObject({ subtotal: 79000, service: 3950, tax: 8295, rounding: 755, grandTotal: 92000 });
    expect(semuaInteger(t)).toBe(true);
  });

  it("pembulatan NEAREST dan DOWN", () => {
    const nearest = hitungTotal({ lines: linesPrd, config: { ...PRD, roundingMode: "NEAREST" } });
    expect(nearest.grandTotal).toBe(91000);
    expect(nearest.rounding).toBe(-245);

    const nearest100 = hitungTotal({ lines: linesPrd, config: { ...PRD, roundingTo: 100, roundingMode: "NEAREST" } });
    expect(nearest100.grandTotal).toBe(91200);
    expect(nearest100.rounding).toBe(-45);

    const down = hitungTotal({ lines: linesPrd, config: { ...PRD, roundingMode: "DOWN" } });
    expect(down.grandTotal).toBe(91000);
    expect(down.rounding).toBe(-245);
  });

  it("roundingTo 0 berarti tanpa pembulatan", () => {
    const t = hitungTotal({ lines: linesPrd, config: { ...PRD, roundingTo: 0 } });
    expect(t.rounding).toBe(0);
    expect(t.grandTotal).toBe(91245);
  });

  it("pajak inclusive tidak menambah total", () => {
    const t = hitungTotal({
      lines: [{ unitPrice: 110000, qty: 1 }],
      config: { taxPercent: 10, taxInclusive: true, servicePercent: 0, roundingTo: 0 },
    });
    expect(t.tax).toBe(10000);
    expect(t.grandTotal).toBe(110000);

    const ppn = hitungTotal({
      lines: [{ unitPrice: 15500, qty: 3 }],
      config: { taxPercent: 11, taxInclusive: true, servicePercent: 0, roundingTo: 100, roundingMode: "NEAREST" },
    });
    expect(ppn.tax).toBe(4608); // 46500 × 11/111
    expect(ppn.grandTotal).toBe(46500);
  });

  it("diskon order lebih besar dari subtotal tidak membuat total negatif", () => {
    const t = hitungTotal({ lines: linesPrd, orderDiscount: 1_000_000, config: PRD });
    expect(t.orderDiscount).toBe(79000);
    expect(t.service).toBe(0);
    expect(t.tax).toBe(0);
    expect(t.grandTotal).toBe(0);
  });

  it("diskon item + order diterapkan sebelum service & pajak", () => {
    const t = hitungTotal({
      lines: [{ unitPrice: 50000, qty: 2, discount: 10000 }],
      orderDiscount: 10000,
      config: { ...PRD, roundingTo: 0 },
    });
    // dasar 80.000 → service 4.000 → pajak 8.400
    expect(t).toMatchObject({ itemDiscount: 10000, orderDiscount: 10000, service: 4000, tax: 8400, grandTotal: 92400 });
  });

  it("semua hasil integer walau persen menghasilkan pecahan", () => {
    const t = hitungTotal({
      lines: [{ unitPrice: 12345, modifierTotal: 333, qty: 3 }],
      orderDiscount: 777,
      config: { taxPercent: 11, taxInclusive: false, servicePercent: 7, roundingTo: 0 },
    });
    expect(semuaInteger(t)).toBe(true);
  });
});

describe("hitungKembalian", () => {
  it("100.000 − 92.000 = 8.000", () => {
    expect(hitungKembalian(100000, 92000)).toBe(8000);
    expect(hitungKembalian(92000, 92000)).toBe(0);
  });

  it("uang kurang atau tidak valid → error", () => {
    expect(() => hitungKembalian(90000, 92000)).toThrow(/kurang/);
    expect(() => hitungKembalian(-1, 0)).toThrow();
    expect(() => hitungKembalian(1000.5, 0)).toThrow();
  });
});
