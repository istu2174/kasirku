import { describe, expect, it } from "vitest";
import { teksStruk, type ReceiptPayload } from "@/lib/struk";

const payload: ReceiptPayload = {
  receiptNo: "CRB-20261120-0001",
  kind: "SALE",
  issuedAt: "2026-11-20T03:15:00.000Z",
  outlet: {
    name: "KasirKu Kafe Cirebon Dengan Nama Sangat Panjang Sekali",
    address: "Jl. Siliwangi No. 123, Kejaksan, Kota Cirebon, Jawa Barat",
    phone: "0231-123456",
    code: "CRB",
  },
  orderNo: "ORD-CRB-20261120-0001",
  orderType: "DINE_IN",
  tableName: "04",
  cashier: "Budi",
  items: [
    {
      name: "Caffe Latte (Regular) dengan nama produk yang panjang",
      qty: 2,
      unitPrice: 23000,
      lineTotal: 54000,
      modifiers: [
        { name: "Less Sugar", priceDelta: 0 },
        { name: "Extra Shot", priceDelta: 4000 },
      ],
      note: "pisah gelas",
    },
    { name: "Croissant", qty: 1, unitPrice: 25000, lineTotal: 25000, modifiers: [] },
  ],
  subtotal: 79000,
  itemDiscount: 0,
  orderDiscount: 0,
  service: 3950,
  serviceLabel: "Service 5%",
  tax: 8295,
  taxLabel: "PB1 10%",
  rounding: 755,
  grandTotal: 92000,
  payment: { method: "CASH", amount: 92000, amountReceived: 100000, change: 8000 },
  footer: "Terima kasih atas kunjungan Anda",
  digitalUrl: "/r/0123456789abcdef",
};

describe("teksStruk", () => {
  it.each([32, 48])("tidak ada baris melebihi lebar %i", (lebar) => {
    const baris = teksStruk(payload, lebar).split("\n");
    const kepanjangan = baris.filter((b) => b.length > lebar);
    expect(kepanjangan).toEqual([]);
  });

  it("label REPRINT hanya muncul dengan {reprint:true}", () => {
    expect(teksStruk(payload, 32)).not.toContain("*** REPRINT ***");
    expect(teksStruk(payload, 32, { reprint: false })).not.toContain("*** REPRINT ***");
    expect(teksStruk(payload, 32, { reprint: true })).toContain("*** REPRINT ***");
  });

  it("struk SALE berstatus LUNAS, refund tidak", () => {
    expect(teksStruk(payload, 32)).toContain("Status: LUNAS");
    const refund = teksStruk({ ...payload, kind: "REFUND" }, 32);
    expect(refund).not.toContain("LUNAS");
    expect(refund).toContain("STRUK REFUND");
  });

  it("memuat nomor struk, total, dan kembalian", () => {
    const teks = teksStruk(payload, 48);
    expect(teks).toContain("CRB-20261120-0001");
    expect(teks).toMatch(/TOTAL\s+Rp\s?92\.000/);
    expect(teks).toMatch(/Kembali\s+Rp\s?8\.000/);
  });
});
