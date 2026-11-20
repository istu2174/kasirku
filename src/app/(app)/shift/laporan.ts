import { rupiah, tanggalWaktu } from "@/lib/format";

/** Bentuk respons GET /api/shifts/[id]/report. */
export type LaporanShift = {
  tipe: "X" | "Z";
  outletName: string;
  shift: {
    id: string;
    status: string;
    openedAt: string;
    closedAt: string | null;
    openingCash: number;
    note: string | null;
    user: { name: string };
  };
  perMetode: Record<string, { jumlah: number; total: number }>;
  totalPenjualan: number;
  jumlahTransaksi: number;
  refundCash: number;
  refundTotal: number;
  jumlahRefund: number;
  kasSeharusnya: number;
  kasTercatat: number;
  kasFisik: number | null;
  selisih: number | null;
  voidOrders: { orderNo: string; grandTotal: number; status: string }[];
  dicetakPada: string;
};

export const LABEL_METODE: Record<string, string> = {
  CASH: "Tunai",
  QRIS: "QRIS",
  VA: "Virtual Account",
  MANUAL_TRANSFER: "Transfer",
  EWALLET: "E-Wallet",
};

const LABEL_VOID: Record<string, string> = {
  CANCELLED: "Batal",
  REFUNDED: "Refund",
  PARTIALLY_REFUNDED: "Refund sbg",
};

const uang = (n: number) => (n < 0 ? "-" + rupiah(-n) : rupiah(n));

/** Teks struk thermal laporan X/Z, lebar tetap (default 32 kolom). */
export function teksLaporanShift(d: LaporanShift, lebar = 32): string {
  const garis = "-".repeat(lebar);
  const tengah = (t: string) => {
    const s = t.slice(0, lebar);
    return " ".repeat(Math.floor((lebar - s.length) / 2)) + s;
  };
  const baris = (kiri: string, kanan: string) => {
    const k = kiri.slice(0, Math.max(0, lebar - kanan.length - 1));
    return k + " ".repeat(Math.max(1, lebar - k.length - kanan.length)) + kanan;
  };

  const out: string[] = [
    tengah(d.outletName),
    tengah(d.tipe === "X" ? "LAPORAN X (SEMENTARA)" : "LAPORAN Z (TUTUP SHIFT)"),
    garis,
    baris("Kasir", d.shift.user.name),
    baris("Buka", tanggalWaktu(d.shift.openedAt)),
  ];
  if (d.shift.closedAt) out.push(baris("Tutup", tanggalWaktu(d.shift.closedAt)));
  out.push(baris("Cetak", tanggalWaktu(d.dicetakPada)), garis, baris("Modal awal", uang(d.shift.openingCash)), garis, "PENJUALAN PER METODE");

  const metode = Object.entries(d.perMetode);
  if (metode.length === 0) out.push("  (belum ada penjualan)");
  for (const [m, v] of metode) out.push(baris(`${LABEL_METODE[m] ?? m} (${v.jumlah})`, uang(v.total)));
  out.push(
    baris("Total penjualan", uang(d.totalPenjualan)),
    baris("Jumlah transaksi", String(d.jumlahTransaksi)),
    garis,
    baris(`Refund (${d.jumlahRefund})`, uang(d.refundTotal)),
    baris("Refund tunai", uang(-d.refundCash)),
    garis,
    baris("Kas seharusnya", uang(d.kasSeharusnya)),
  );
  if (d.kasFisik !== null) out.push(baris("Kas fisik", uang(d.kasFisik)));
  if (d.selisih !== null) out.push(baris("SELISIH", uang(d.selisih)));
  if (d.kasTercatat !== d.kasSeharusnya) out.push(baris("Kas tercatat sistem", uang(d.kasTercatat)));

  out.push(garis, `VOID/REFUND (${d.voidOrders.length})`);
  for (const v of d.voidOrders) {
    out.push(baris(v.orderNo, LABEL_VOID[v.status] ?? v.status), baris("", uang(v.grandTotal)));
  }
  if (d.shift.note) out.push(garis, `Catatan: ${d.shift.note}`.slice(0, lebar));
  out.push(garis, tengah(d.tipe === "X" ? "Shift masih berjalan" : "-- Akhir laporan --"));
  return out.join("\n");
}
