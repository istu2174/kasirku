/** Payload struk contoh untuk preview di halaman Pengaturan dan Tes Cetak. Murni, aman dipakai di browser. */
import { hitungTotal, type TaxConfig } from "@/lib/money";
import type { ReceiptPayload } from "@/lib/struk";

export function contohStruk(
  outlet: { name: string; address: string; phone: string; code: string },
  pajak: TaxConfig,
  footer: string,
): ReceiptPayload {
  const items = [
    { name: "Kopi Susu Gula Aren", qty: 2, unitPrice: 25000, modifiers: [{ name: "Extra shot", priceDelta: 5000 }] },
    { name: "Roti Bakar Coklat", qty: 1, unitPrice: 40000, modifiers: [] },
  ];
  const t = hitungTotal({
    lines: items.map((i) => ({
      unitPrice: i.unitPrice,
      modifierTotal: i.modifiers.reduce((s, m) => s + m.priceDelta, 0),
      qty: i.qty,
    })),
    config: pajak,
  });
  return {
    receiptNo: `${outlet.code}-CONTOH-0001`,
    kind: "SALE",
    issuedAt: "2026-01-15T12:30:00+07:00", // tetap, supaya preview SSR & browser identik
    outlet,
    orderNo: "CONTOH",
    orderType: "DINE_IN",
    tableName: "A1",
    cashier: "Kasir",
    items: items.map((i) => ({
      ...i,
      lineTotal: (i.unitPrice + i.modifiers.reduce((s, m) => s + m.priceDelta, 0)) * i.qty,
    })),
    subtotal: t.subtotal,
    itemDiscount: t.itemDiscount,
    orderDiscount: t.orderDiscount,
    service: t.service,
    serviceLabel: `Service ${pajak.servicePercent}%`,
    tax: t.tax,
    taxLabel: `${pajak.taxName ?? "Pajak"} ${pajak.taxPercent}%${pajak.taxInclusive ? " (termasuk)" : ""}`,
    rounding: t.rounding,
    grandTotal: t.grandTotal,
    payment: { method: "CASH", amount: t.grandTotal, amountReceived: t.grandTotal, change: 0 },
    footer,
    digitalUrl: "/r/contoh",
  };
}
