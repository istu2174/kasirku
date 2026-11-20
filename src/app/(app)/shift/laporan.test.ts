import { describe, expect, it } from "vitest";
import { teksLaporanShift, type LaporanShift } from "./laporan";

const dasar: LaporanShift = {
  tipe: "Z",
  outletName: "Kafe Contoh Cabang Yang Namanya Panjang Sekali",
  shift: {
    id: "s1",
    status: "CLOSED",
    openedAt: "2026-11-20T01:00:00.000Z",
    closedAt: "2026-11-20T10:00:00.000Z",
    openingCash: 500_000,
    note: null,
    user: { name: "Budi" },
  },
  perMetode: { CASH: { jumlah: 3, total: 150_000 }, MANUAL_TRANSFER: { jumlah: 1, total: 75_000 } },
  totalPenjualan: 225_000,
  jumlahTransaksi: 4,
  refundCash: 20_000,
  refundTotal: 20_000,
  jumlahRefund: 1,
  kasSeharusnya: 630_000,
  kasTercatat: 650_000,
  kasFisik: 625_000,
  selisih: -5_000,
  voidOrders: [{ orderNo: "CRB-20261120-0001", grandTotal: 20_000, status: "PARTIALLY_REFUNDED" }],
  dicetakPada: "2026-11-20T10:00:00.000Z",
};

describe("teksLaporanShift", () => {
  it("tidak ada baris melebihi 32 kolom", () => {
    for (const b of teksLaporanShift(dasar).split("\n")) expect(b.length).toBeLessThanOrEqual(32);
  });

  it("memuat refund tunai, selisih minus, dan kas tercatat bila beda", () => {
    const t = teksLaporanShift(dasar);
    expect(t).toMatch(/Refund tunai\s+-Rp20\.000/);
    expect(t).toMatch(/SELISIH\s+-Rp5\.000/);
    expect(t).toMatch(/Kas tercatat sistem\s+Rp650\.000/);
    expect(t).toMatch(/Transfer \(1\)\s+Rp75\.000/);
  });

  it("laporan X tanpa kas fisik/selisih", () => {
    const t = teksLaporanShift({ ...dasar, tipe: "X", kasFisik: null, selisih: null, kasTercatat: 630_000 });
    expect(t).not.toMatch(/SELISIH|Kas fisik|Kas tercatat/);
    expect(t).toContain("LAPORAN X");
  });
});
