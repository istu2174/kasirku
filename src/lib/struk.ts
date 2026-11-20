/** Format struk murni (tanpa akses DB) supaya bisa dipakai di server & browser. */
import { angka, rupiah, tanggalWaktu } from "@/lib/format";

export type StrukItem = {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  modifiers: { name: string; priceDelta: number }[];
  note?: string | null;
};

export type ReceiptPayload = {
  receiptNo: string;
  kind: "SALE" | "VOID" | "REFUND";
  issuedAt: string;
  outlet: { name: string; address: string; phone: string; code: string };
  orderNo: string;
  orderType: string;
  tableName?: string | null;
  cashier: string;
  items: StrukItem[];
  subtotal: number;
  itemDiscount: number;
  orderDiscount: number;
  service: number;
  serviceLabel?: string; // mis. "Service 5%"
  tax: number;
  taxLabel?: string; // mis. "PB1 10%"
  rounding: number;
  grandTotal: number;
  payment: { method: string; amount: number; amountReceived?: number | null; change?: number | null };
  header?: string; // baris tambahan di bawah alamat (mis. NPWP, jam buka)
  footer: string;
  digitalUrl: string;
  refundAmount?: number; // khusus struk REFUND/VOID: nominal yang dikembalikan
  refundReason?: string;
};

const duaKolom = (kiri: string, kanan: string, lebar: number) => {
  const ruang = Math.max(lebar - kanan.length, 0);
  return (kiri.length > ruang ? kiri.slice(0, ruang) : kiri.padEnd(ruang)) + kanan;
};

export function teksStruk(p: ReceiptPayload, lebar = 32, opsi: { reprint?: boolean } = {}): string {
  const L: string[] = [];
  const garis = "-".repeat(lebar);
  const tengah = (t: string) =>
    t.slice(0, lebar).padStart(Math.floor((lebar + Math.min(t.length, lebar)) / 2)).padEnd(lebar);

  L.push(tengah(p.outlet.name.toUpperCase()));
  L.push(tengah(p.outlet.address));
  L.push(tengah(`Telp: ${p.outlet.phone}`));
  for (const baris of (p.header ?? "").split("\n").filter(Boolean)) L.push(tengah(baris));
  L.push(garis);
  if (opsi.reprint) L.push(tengah("*** REPRINT ***"));
  if (p.kind !== "SALE") {
    L.push(tengah(`*** ${p.kind === "VOID" ? "STRUK PEMBATALAN" : "STRUK REFUND"} ***`));
  }
  L.push(`No  : ${p.receiptNo}`);
  L.push(`Tgl : ${tanggalWaktu(p.issuedAt)}`);
  L.push(duaKolom(`Kasir: ${p.cashier}`, p.tableName ? `Meja: ${p.tableName}` : "", lebar));
  const tipe: Record<string, string> = { DINE_IN: "Dine-in", TAKEAWAY: "Takeaway", DELIVERY: "Delivery", WALK_IN: "Walk-in" };
  L.push(`Tipe: ${tipe[p.orderType] ?? p.orderType}`);
  L.push(garis);

  for (const item of p.items) {
    L.push(duaKolom(`${item.qty}x ${item.name}`, angka(item.unitPrice * item.qty), lebar));
    for (const m of item.modifiers) {
      L.push(duaKolom(`  - ${m.name}`, m.priceDelta ? `+${angka(m.priceDelta * item.qty)}` : "", lebar));
    }
    if (item.note) L.push(`  * ${item.note}`);
  }

  L.push(garis);
  L.push(duaKolom("Subtotal", rupiah(p.subtotal), lebar));
  if (p.itemDiscount) L.push(duaKolom("Diskon", `-${rupiah(p.itemDiscount)}`, lebar));
  if (p.orderDiscount) L.push(duaKolom("Diskon order", `-${rupiah(p.orderDiscount)}`, lebar));
  if (p.service) L.push(duaKolom(p.serviceLabel ?? "Service", rupiah(p.service), lebar));
  if (p.tax) L.push(duaKolom(p.taxLabel ?? "Pajak", rupiah(p.tax), lebar));
  if (p.rounding) L.push(duaKolom("Pembulatan", rupiah(p.rounding), lebar));
  L.push(garis);
  L.push(duaKolom("TOTAL", rupiah(p.grandTotal), lebar));
  L.push(garis);
  L.push(duaKolom(`Bayar (${p.payment.method})`, rupiah(p.payment.amount), lebar));
  if (p.payment.method === "CASH" && p.payment.amountReceived) {
    L.push(duaKolom("Diterima", rupiah(p.payment.amountReceived), lebar));
    L.push(duaKolom("Kembali", rupiah(p.payment.change ?? 0), lebar));
  }
  if (p.kind !== "SALE" && p.refundAmount) {
    L.push(duaKolom("DIKEMBALIKAN", rupiah(p.refundAmount), lebar));
    if (p.refundReason) L.push(`Alasan: ${p.refundReason}`.slice(0, lebar));
  }
  L.push(p.kind === "SALE" ? "Status: LUNAS" : `Status: ${p.kind}`);
  L.push(garis);
  for (const baris of p.footer.split("\n")) L.push(tengah(baris));
  L.push(tengah("Struk digital:"));
  L.push(tengah(p.digitalUrl));
  return L.join("\n");
}
