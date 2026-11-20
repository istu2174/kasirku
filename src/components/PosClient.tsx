"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { ChefHat, Minus, PauseCircle, Plus, Search, StickyNote, Trash2, WifiOff, X } from "lucide-react";
import { api, rupiah } from "@/lib/client";
import { hitungTotal, type TaxConfig } from "@/lib/money";
import { teksStruk, type ReceiptPayload } from "@/lib/struk";
import { antreOrder, jumlahAntrean, sinkronAntrean } from "@/lib/offline";
import { cetakDiBrowser } from "@/lib/cetak-browser";
import { Badge, Button, Empty, Input, Modal, Select, Toast } from "@/components/ui";

type Modifier = { id: string; name: string; priceDelta: number };
type Grup = { id: string; name: string; minSelect: number; maxSelect: number; modifiers: Modifier[] };
type Varian = { id: string; name: string; priceDelta: number };

export type Produk = {
  id: string;
  name: string;
  price: number;
  imageEmoji: string;
  sku: string;
  barcode: string | null;
  stock: number;
  trackStock: boolean;
  categoryId: string | null;
  variants: Varian[];
  modifierGroups: Grup[];
};
export type Kategori = { id: string; name: string };
export type Meja = { id: string; name: string; status: string };

type Baris = {
  key: string;
  productId: string;
  variantId: string | null;
  name: string;
  emoji: string;
  unitPrice: number;
  modifierIds: string[];
  modifiers: { name: string; priceDelta: number }[];
  qty: number;
  note: string;
};

type TipeOrder = "DINE_IN" | "TAKEAWAY" | "WALK_IN";
type OrderRingkas = { id: string; orderNo: string; status: string; type: string; tableId: string | null };
export type BarisAwal = { order: OrderRingkas; items: Baris[] };

type OrderServer = OrderRingkas & {
  grandTotal: number;
  subtotal: number;
  service: number;
  tax: number;
  rounding: number;
};
type StrukHasil = { id: string; receiptNo: string; payloadJson: string; digitalToken: string };
type Charge = { paymentId: string; qrImageUrl?: string; vaNumber?: string; expiresAt: string };
type StatusBayar = "IDLE" | "MENUNGGU" | "LUNAS" | "GAGAL" | "KEDALUWARSA";
type Metode = "CASH" | "QRIS" | "VA" | "BANK";
export type Rekening = { bankName: string; bankAccountNo: string; bankAccountName: string };

const NOMINAL_CEPAT = [50000, 100000, 150000, 200000];
const POLLING_MS = 5000;
const POLLING_DURASI_MS = 2 * 60_000;

/** Bunyi "ding" saat pembayaran masuk (Web Audio, tanpa file). */
function ding() {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = f;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.15;
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  } catch {
    /* browser tanpa audio: abaikan */
  }
}

const sumMod = (b: Baris) => b.modifiers.reduce((s, m) => s + m.priceDelta, 0);
const LABEL_TIPE: Record<TipeOrder, string> = { DINE_IN: "Dine-in", TAKEAWAY: "Takeaway", WALK_IN: "Walk-in" };

export default function PosClient({
  produk,
  kategori,
  meja,
  config,
  outlet,
  kasir,
  tipeBisnis,
  shiftAktif,
  barisAwal,
  mejaAwal,
  modeDev,
  rekening,
  bolehApprove,
}: {
  produk: Produk[];
  kategori: Kategori[];
  meja: Meja[];
  config: TaxConfig;
  outlet: { name: string; address: string; phone: string; code: string };
  kasir: string;
  tipeBisnis: string;
  shiftAktif: boolean;
  barisAwal: BarisAwal | null;
  mejaAwal: string | null;
  modeDev: boolean;
  rekening: Rekening;
  bolehApprove: boolean;
}) {
  const router = useRouter();
  const minimarket = tipeBisnis === "MINIMARKET";
  const [cari, setCari] = useState("");
  const [kat, setKat] = useState<string>("ALL");
  const [baris, setBaris] = useState<Baris[]>(barisAwal?.items ?? []);
  const [mejaId, setMejaId] = useState<string>(barisAwal?.order.tableId ?? mejaAwal ?? "");
  const [tipe, setTipe] = useState<TipeOrder>(
    (barisAwal?.order.type as TipeOrder | undefined) ?? (minimarket ? "WALK_IN" : "DINE_IN"),
  );
  const [orderAktif, setOrderAktif] = useState<OrderRingkas | null>(barisAwal?.order ?? null);
  const [dirty, setDirty] = useState(false);
  const [catatanKey, setCatatanKey] = useState<string | null>(null);

  const [pilihProduk, setPilihProduk] = useState<Produk | null>(null);
  const [varianId, setVarianId] = useState<string | null>(null);
  const [pilihanMod, setPilihanMod] = useState<Record<string, string[]>>({});

  const [bayarOpen, setBayarOpen] = useState(false);
  const [tagihan, setTagihan] = useState<{ order: OrderServer | null; grandTotal: number } | null>(null);
  const [metode, setMetode] = useState<Metode>("CASH");
  const [uang, setUang] = useState<number>(0);
  const [idemKey, setIdemKey] = useState("");
  const [charge, setCharge] = useState<Charge | null>(null);
  const [statusBayar, setStatusBayar] = useState<StatusBayar>("IDLE");
  const [pollSampai, setPollSampai] = useState(0);
  const [sisaDetik, setSisaDetik] = useState(0);
  const [kembalian, setKembalian] = useState<number | null>(null);
  const [buktiFoto, setBuktiFoto] = useState<string | null>(null);

  const [struk, setStruk] = useState<{ teks: string; data: StrukHasil | null } | null>(null);
  const [tertahan, setTertahan] = useState<OrderServer[] | null>(null);
  const [online, setOnline] = useState(true);
  const [antrean, setAntrean] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const cariRef = useRef<HTMLInputElement>(null);

  const kabar = useCallback((pesan: string) => {
    setInfo(pesan);
    setTimeout(() => setInfo(null), 3500);
  }, []);

  // ── Online/offline + sinkron antrean ─────────────────────────────────────────
  useEffect(() => {
    const perbarui = async () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) {
        const hasil = await sinkronAntrean();
        if (hasil.sukses) kabar(`${hasil.sukses} order offline tersinkron, struk resmi dicetak`);
        if (hasil.gagal) setError(`${hasil.gagal} order offline gagal sinkron, cek koneksi/stok`);
      }
      setAntrean(await jumlahAntrean());
    };
    void perbarui();
    window.addEventListener("online", perbarui);
    window.addEventListener("offline", perbarui);
    return () => {
      window.removeEventListener("online", perbarui);
      window.removeEventListener("offline", perbarui);
    };
  }, [kabar]);

  const terfilter = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return produk.filter((p) => {
      if (kat !== "ALL" && p.categoryId !== kat) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode ?? "").includes(q);
    });
  }, [produk, cari, kat]);

  const total = useMemo(
    () =>
      hitungTotal({
        lines: baris.map((b) => ({ unitPrice: b.unitPrice, modifierTotal: sumMod(b), qty: b.qty })),
        config,
      }),
    [baris, config],
  );

  // ── Keranjang ────────────────────────────────────────────────────────────────
  function ubahBaris(fn: (b: Baris[]) => Baris[]) {
    setBaris(fn);
    setDirty(true);
  }

  function tambahLangsung(p: Produk) {
    ubahBaris((kini) => {
      const ada = kini.find((b) => b.productId === p.id && !b.variantId && b.modifierIds.length === 0 && !b.note);
      if (ada) return kini.map((b) => (b.key === ada.key ? { ...b, qty: b.qty + 1 } : b));
      return [
        ...kini,
        {
          key: `${p.id}-${Date.now()}`,
          productId: p.id,
          variantId: null,
          name: p.name,
          emoji: p.imageEmoji,
          unitPrice: p.price,
          modifierIds: [],
          modifiers: [],
          qty: 1,
          note: "",
        },
      ];
    });
  }

  function klikProduk(p: Produk) {
    if (p.variants.length || p.modifierGroups.length) {
      setPilihProduk(p);
      setVarianId(null);
      setPilihanMod(Object.fromEntries(p.modifierGroups.map((g) => [g.id, []])));
      return;
    }
    tambahLangsung(p);
  }

  function konfirmasiVarian() {
    if (!pilihProduk) return;
    const p = pilihProduk;
    for (const g of p.modifierGroups) {
      if ((pilihanMod[g.id] ?? []).length < g.minSelect) {
        setError(`${g.name} wajib dipilih minimal ${g.minSelect}`);
        return;
      }
    }
    const varian = p.variants.find((v) => v.id === varianId) ?? null;
    const mods = p.modifierGroups.flatMap((g) =>
      (pilihanMod[g.id] ?? []).map((id) => g.modifiers.find((m) => m.id === id)).filter((m): m is Modifier => Boolean(m)),
    );
    ubahBaris((kini) => [
      ...kini,
      {
        key: `${p.id}-${Date.now()}`,
        productId: p.id,
        variantId: varian?.id ?? null,
        name: varian ? `${p.name} (${varian.name})` : p.name,
        emoji: p.imageEmoji,
        unitPrice: p.price + (varian?.priceDelta ?? 0),
        modifierIds: mods.map((m) => m.id),
        modifiers: mods.map((m) => ({ name: m.name, priceDelta: m.priceDelta })),
        qty: 1,
        note: "",
      },
    ]);
    setPilihProduk(null);
    setError(null);
  }

  function ubahQty(key: string, delta: number) {
    ubahBaris((kini) => kini.map((b) => (b.key === key ? { ...b, qty: b.qty + delta } : b)).filter((b) => b.qty > 0));
  }

  function resetKasir() {
    setBaris([]);
    setOrderAktif(null);
    setDirty(false);
    setMejaId("");
    if (barisAwal || mejaAwal) router.replace("/pos");
  }

  // Scan barcode: scanner mengetik kode lalu Enter → cocok persis barcode/SKU langsung masuk.
  function onCariKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const q = cari.trim();
    const p = produk.find((x) => x.barcode === q || x.sku.toLowerCase() === q.toLowerCase());
    if (p) {
      klikProduk(p);
      setCari("");
    } else if (terfilter.length === 1) {
      klikProduk(terfilter[0]);
      setCari("");
    }
  }

  // ── Simpan order ke server ───────────────────────────────────────────────────
  function payloadItem() {
    return baris.map((b) => ({
      productId: b.productId,
      variantId: b.variantId,
      qty: b.qty,
      modifierIds: b.modifierIds,
      note: b.note.trim() || null,
    }));
  }

  /** Buat order baru, atau perbarui order tertahan kalau keranjang berubah. */
  async function pastikanOrder(): Promise<OrderServer | null> {
    if (!baris.length) {
      setError("Keranjang masih kosong");
      return null;
    }
    if (!shiftAktif) {
      setError("Shift belum dibuka. Buka shift dulu di menu Shift & Kas.");
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      let hasil: { order: OrderServer };
      if (orderAktif && !dirty) hasil = await api<{ order: OrderServer }>(`/api/orders/${orderAktif.id}`);
      else if (orderAktif)
        hasil = await api(`/api/orders/${orderAktif.id}`, {
          method: "PATCH",
          body: JSON.stringify({ items: payloadItem() }),
        });
      else
        hasil = await api("/api/orders", {
          method: "POST",
          body: JSON.stringify({
            type: tipe,
            tableId: tipe === "DINE_IN" && mejaId ? mejaId : null,
            items: payloadItem(),
          }),
        });
      setOrderAktif(hasil.order);
      setDirty(false);
      return hasil.order;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan order");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function holdBill() {
    const o = await pastikanOrder();
    if (!o) return;
    resetKasir();
    kabar(`Bill ${o.orderNo} ditahan. Buka lagi lewat "Bill tertahan".`);
  }

  async function kirimDapur() {
    const o = await pastikanOrder();
    if (!o) return;
    try {
      await api(`/api/orders/${o.id}/confirm`, { method: "POST" });
      setOrderAktif({ ...o, status: "CONFIRMED" });
      kabar(`${o.orderNo} dikirim ke dapur`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal kirim ke dapur");
    }
  }

  async function bukaTertahan() {
    try {
      const d = await api<{ orders: OrderServer[] }>("/api/orders?status=DRAFT,CONFIRMED&limit=50");
      setTertahan(d.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat bill");
    }
  }

  // ── Pembayaran ───────────────────────────────────────────────────────────────
  async function bukaBayar(m: Metode) {
    if (!baris.length || loading) return;
    if (!online && m !== "CASH") {
      setError("QRIS/Transfer butuh koneksi internet. Gunakan cash saat offline.");
      return;
    }
    const o = online ? await pastikanOrder() : null;
    if (online && !o) return;
    if (!online && !shiftAktif) {
      setError("Shift belum dibuka.");
      return;
    }
    const grand = o?.grandTotal ?? total.grandTotal;
    setTagihan({ order: o, grandTotal: grand });
    setUang(grand);
    setMetode(m);
    setCharge(null);
    setKembalian(null);
    setStatusBayar("IDLE");
    setIdemKey(crypto.randomUUID()); // satu key per sesi bayar: klik ganda tidak membuat payment kedua
    setBayarOpen(true);
    setBuktiFoto(null);
    if ((m === "QRIS" || m === "VA") && o) void buatCharge(m, o.id);
  }

  async function bayarCash() {
    if (!tagihan || loading || uang < tagihan.grandTotal) return;
    setLoading(true);
    setError(null);
    try {
      if (!online || !tagihan.order) {
        await bayarOffline();
        return;
      }
      const hasil = await api<{ change: number; receipt: StrukHasil }>(
        `/api/orders/${tagihan.order.id}/payments/cash`,
        { method: "POST", body: JSON.stringify({ amountReceived: uang, idempotencyKey: idemKey }) },
      );
      selesaiLunas(hasil.receipt, hasil.change);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pembayaran gagal");
    } finally {
      setLoading(false);
    }
  }

  /** Offline: simpan ke IndexedDB, tampilkan struk sementara. Struk resmi terbit saat sinkron. */
  async function bayarOffline() {
    if (!tagihan) return;
    const clientRef = crypto.randomUUID();
    await antreOrder({
      clientRef,
      type: tipe,
      tableId: tipe === "DINE_IN" && mejaId ? mejaId : null,
      amountReceived: uang,
      grandTotal: tagihan.grandTotal,
      items: payloadItem(),
    });
    const payload: ReceiptPayload = {
      receiptNo: `OFFLINE-${clientRef.slice(0, 8).toUpperCase()}`,
      kind: "SALE",
      issuedAt: new Date().toISOString(),
      outlet,
      orderNo: "(menunggu sinkron)",
      orderType: tipe,
      tableName: meja.find((m) => m.id === mejaId)?.name ?? null,
      cashier: kasir,
      items: baris.map((b) => ({
        name: b.name,
        qty: b.qty,
        unitPrice: b.unitPrice,
        lineTotal: (b.unitPrice + sumMod(b)) * b.qty,
        modifiers: b.modifiers,
        note: b.note || null,
      })),
      subtotal: total.subtotal,
      itemDiscount: 0,
      orderDiscount: 0,
      service: total.service,
      serviceLabel: `Service ${config.servicePercent}%`,
      tax: total.tax,
      taxLabel: `${config.taxName ?? "Pajak"} ${config.taxPercent}%`,
      rounding: total.rounding,
      grandTotal: total.grandTotal,
      payment: { method: "CASH", amount: total.grandTotal, amountReceived: uang, change: uang - total.grandTotal },
      footer: "STRUK SEMENTARA (OFFLINE)\nStruk resmi bernomor dicetak\notomatis saat online.",
      digitalUrl: "-",
    };
    setAntrean(await jumlahAntrean());
    setKembalian(uang - total.grandTotal);
    setStatusBayar("LUNAS");
    ding();
    setStruk({ teks: teksStruk(payload, 32), data: null });
    setBayarOpen(false);
    resetKasir();
  }

  async function buatCharge(m: "QRIS" | "VA", orderId: string) {
    setLoading(true);
    setError(null);
    try {
      const hasil = await api<Charge>(`/api/orders/${orderId}/payments/charge`, {
        method: "POST",
        body: JSON.stringify({ method: m }),
      });
      setCharge(hasil);
      setStatusBayar("MENUNGGU");
      setPollSampai(Date.now() + POLLING_DURASI_MS);
    } catch (err) {
      setStatusBayar("GAGAL");
      setError(err instanceof Error ? err.message : "Gagal membuat tagihan");
    } finally {
      setLoading(false);
    }
  }

  const selesaiLunas = useCallback(
    (receipt: StrukHasil | null, change: number | null) => {
      setStatusBayar("LUNAS");
      setKembalian(change);
      ding();
      if (receipt) {
        try {
          setStruk({ teks: teksStruk(JSON.parse(receipt.payloadJson) as ReceiptPayload, 32), data: receipt });
        } catch {
          setStruk({ teks: "", data: receipt });
        }
      }
      setBayarOpen(false);
      setBaris([]);
      setOrderAktif(null);
      setDirty(false);
      setMejaId("");
      kabar("LUNAS — struk dicetak otomatis");
      router.refresh(); // stok & status meja terbaru
    },
    [kabar, router],
  );

  const cekStatus = useCallback(async () => {
    if (!charge) return;
    try {
      const hasil = await api<{ payment: { status: string }; receipt: StrukHasil | null }>(
        `/api/payments/${charge.paymentId}`,
      );
      const s = hasil.payment.status;
      if (s === "PAID") selesaiLunas(hasil.receipt, null);
      else if (s === "EXPIRED") setStatusBayar("KEDALUWARSA");
      else if (s === "FAILED" || s === "NEEDS_REVIEW") setStatusBayar("GAGAL");
    } catch {
      /* jaringan sesaat: coba lagi di putaran berikut */
    }
  }, [charge, selesaiLunas]);

  // Polling fallback 5 detik selama 2 menit (webhook tetap sumber kebenaran).
  useEffect(() => {
    if (statusBayar !== "MENUNGGU" || !charge) return;
    const timer = setInterval(() => {
      if (Date.now() > pollSampai) return;
      void cekStatus();
    }, POLLING_MS);
    return () => clearInterval(timer);
  }, [statusBayar, charge, pollSampai, cekStatus]);

  // Hitung mundur kedaluwarsa QR/VA.
  useEffect(() => {
    if (!charge || statusBayar !== "MENUNGGU") return;
    const tick = () => {
      const sisa = Math.max(0, Math.round((new Date(charge.expiresAt).getTime() - Date.now()) / 1000));
      setSisaDetik(sisa);
      if (sisa === 0) setStatusBayar("KEDALUWARSA");
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [charge, statusBayar]);

  /** Kecilkan foto bukti (maks 1280px, JPEG) supaya ringan disimpan di database. */
  async function kompresFoto(file: File): Promise<string> {
    const gambar = await createImageBitmap(file);
    const skala = Math.min(1, 1280 / Math.max(gambar.width, gambar.height));
    const kanvas = document.createElement("canvas");
    kanvas.width = Math.round(gambar.width * skala);
    kanvas.height = Math.round(gambar.height * skala);
    const ctx = kanvas.getContext("2d");
    if (!ctx) throw new Error("Canvas tidak tersedia");
    ctx.drawImage(gambar, 0, 0, kanvas.width, kanvas.height);
    return kanvas.toDataURL("image/jpeg", 0.7);
  }

  async function kirimBukti() {
    if (!tagihan?.order || !buktiFoto) return;
    setLoading(true);
    setError(null);
    try {
      const d = await api<{ payment: { id: string } }>(`/api/orders/${tagihan.order.id}/payments/manual-proof`, {
        method: "POST",
        body: JSON.stringify({ proofUrl: buktiFoto, amount: tagihan.grandTotal }),
      });
      // Pakai mesin polling yang sama dengan QRIS; batas 24 jam hanya untuk layar ini.
      setCharge({ paymentId: d.payment.id, expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString() });
      setStatusBayar("MENUNGGU");
      setPollSampai(Date.now() + POLLING_DURASI_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim bukti");
    } finally {
      setLoading(false);
    }
  }

  async function setujuiTransfer() {
    if (!tagihan?.order || !charge) return;
    setLoading(true);
    try {
      await api(`/api/orders/${tagihan.order.id}/payments/manual-proof`, {
        method: "PATCH",
        body: JSON.stringify({ paymentId: charge.paymentId, setujui: true }),
      });
      await cekStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyetujui transfer");
    } finally {
      setLoading(false);
    }
  }

  async function simulasi(status: "settlement" | "expire") {
    if (!charge) return;
    try {
      await api("/api/dev/simulate", { method: "POST", body: JSON.stringify({ paymentId: charge.paymentId, status }) });
      await cekStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulasi gagal");
    }
  }

  async function cetakUlang() {
    if (!struk?.data) return;
    try {
      await api(`/api/receipts/${struk.data.id}/print`, { method: "POST" });
      kabar("Cetak ulang dikirim (label *** REPRINT ***)");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal cetak ulang");
    }
  }

  // ── Shortcut keyboard ────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        cariRef.current?.focus();
      } else if (e.key === "F4") {
        e.preventDefault();
        if (!bayarOpen) void bukaBayar("CASH");
      } else if (e.key === "F8") {
        e.preventDefault();
        if (!bayarOpen) void bukaBayar("QRIS");
      } else if (e.key === "Enter" && bayarOpen && metode === "CASH") {
        e.preventDefault();
        void bayarCash();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const mejaTerpilih = meja.find((m) => m.id === mejaId);
  const menitDetik = `${Math.floor(sisaDetik / 60)}:${String(sisaDetik % 60).padStart(2, "0")}`;

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:flex-row">
      {/* ── Katalog ── */}
      <section className="flex min-h-0 flex-1 flex-col p-4 lg:p-6">
        {(!online || antrean > 0) && (
          <div className="mb-3 flex items-center gap-2 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-700 ring-1 ring-amber-400/20">
            <WifiOff size={16} />
            {!online
              ? "Offline: order cash tetap jalan & disimpan di perangkat. QRIS/Transfer butuh koneksi internet."
              : `${antrean} order offline menunggu sinkron.`}
          </div>
        )}
        {modeDev && (
          <div className="mb-3 rounded-2xl bg-brand-500/10 px-4 py-2.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-400/25">
            MODE DEMO PEMBAYARAN — QRIS &amp; VA masih simulasi (belum tersambung payment gateway). Jangan terima
            pembayaran asli lewat QR ini.
          </div>
        )}
        {!shiftAktif && (
          <a
            href="/shift"
            className="mb-3 block rounded-2xl bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-600 ring-1 ring-rose-400/20"
          >
            Shift belum dibuka — klik untuk buka shift sebelum menerima order.
          </a>
        )}

        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <Input
              ref={cariRef}
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              onKeyDown={onCariKey}
              placeholder="Cari nama / SKU, atau scan barcode (F2)"
              className="pl-11"
              autoFocus={minimarket}
            />
          </div>
          {cari && (
            <Button variant="ghost" onClick={() => setCari("")} aria-label="Bersihkan pencarian">
              <X size={16} />
            </Button>
          )}
          <Button variant="outline" onClick={bukaTertahan}>
            <PauseCircle size={16} /> <span className="hidden sm:inline">Bill tertahan</span>
          </Button>
        </div>

        <div className="mb-4 flex gap-2 overflow-x-auto px-1 pb-2">
          {[{ id: "ALL", name: "Semua" }, ...kategori].map((k) => (
            <button
              key={k.id}
              onClick={() => setKat(k.id)}
              className={clsx(
                "min-h-11 shrink-0 rounded-2xl px-4 text-sm font-semibold transition",
                kat === k.id ? "bg-grad-brand text-white shadow-glow" : "bg-base-800 text-muted shadow-neu-sm hover:text-fg",
              )}
            >
              {k.name}
            </button>
          ))}
        </div>

        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-4 overflow-y-auto p-1 pb-24 sm:grid-cols-3 xl:grid-cols-4">
          {terfilter.map((p) => (
            <button
              key={p.id}
              onClick={() => klikProduk(p)}
              className="neu group flex flex-col items-start gap-1 p-4 text-left transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-neu-in"
            >
              <div className="mb-2 grid h-12 w-12 place-items-center rounded-2xl text-2xl shadow-neu-in-sm">{p.imageEmoji}</div>
              <p className="line-clamp-2 min-h-[2.5em] text-sm font-bold leading-tight text-fg">{p.name}</p>
              <p className="uang text-sm font-extrabold text-brand-700">{rupiah(p.price)}</p>
              {p.trackStock && (
                <p className={clsx("text-[11px] font-semibold", p.stock <= 5 ? "text-rose-600" : "text-muted")}>
                  stok {p.stock}
                </p>
              )}
            </button>
          ))}
          {!terfilter.length && (
            <div className="col-span-full">
              <Empty>Produk tidak ditemukan.</Empty>
            </div>
          )}
        </div>
      </section>

      {/* ── Keranjang ── */}
      <aside className="flex w-full shrink-0 flex-col p-4 lg:h-full lg:w-[400px] lg:pl-0">
        <div className="neu flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <p className="text-grad text-base font-extrabold">{orderAktif ? orderAktif.orderNo : "Pesanan Baru"}</p>
              <p className="text-[11px] text-muted">
                {kasir} • {shiftAktif ? "Shift terbuka" : "Shift belum dibuka"}
                {orderAktif && ` • ${orderAktif.status === "CONFIRMED" ? "di dapur" : "tertahan"}`}
              </p>
            </div>
            {baris.length > 0 && (
              <button
                onClick={resetKasir}
                className="grid h-11 w-11 place-items-center rounded-2xl text-muted shadow-neu-sm hover:text-rose-600"
                aria-label="Kosongkan keranjang"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>

          {!minimarket && (
            <div className="space-y-3 border-b border-line px-5 py-3">
              <div className="neu-in grid grid-cols-2 gap-1 p-1">
                {(["DINE_IN", "TAKEAWAY"] as const).map((t) => (
                  <button
                    key={t}
                    disabled={Boolean(orderAktif)}
                    onClick={() => setTipe(t)}
                    className={clsx(
                      "min-h-10 rounded-xl text-xs font-bold transition disabled:cursor-not-allowed",
                      tipe === t ? "bg-grad-brand text-white" : "text-muted",
                    )}
                  >
                    {LABEL_TIPE[t]}
                  </button>
                ))}
              </div>
              {tipe === "DINE_IN" && meja.length > 0 && (
                <Select
                  aria-label="Pilih meja"
                  value={mejaId}
                  disabled={Boolean(orderAktif)}
                  onChange={(e) => setMejaId(e.target.value)}
                >
                  <option value="">Tanpa meja</option>
                  {meja.map((m) => (
                    <option key={m.id} value={m.id}>
                      Meja {m.name} {m.status !== "KOSONG" ? `(${m.status.toLowerCase().replace("_", " ")})` : ""}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          )}

          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {!baris.length && <p className="px-3 py-10 text-center text-sm text-muted">Belum ada item. Pilih produk.</p>}
            {baris.map((b) => (
              <div key={b.key} className="rounded-2xl px-3 py-2.5 hover:bg-black/[0.03]">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-xl">{b.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{b.name}</p>
                    {b.modifiers.length > 0 && (
                      <p className="truncate text-[11px] text-muted">{b.modifiers.map((m) => m.name).join(", ")}</p>
                    )}
                    {b.note && <p className="truncate text-[11px] italic text-brand-700">“{b.note}”</p>}
                    <p className="uang text-xs text-muted">{rupiah(b.unitPrice + sumMod(b))}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => ubahQty(b.key, -1)}
                      className="grid h-11 w-11 place-items-center rounded-xl shadow-neu-sm active:shadow-neu-in-sm"
                      aria-label={`Kurangi ${b.name}`}
                    >
                      <Minus size={14} />
                    </button>
                    <span className="uang w-6 text-center text-sm font-bold">{b.qty}</span>
                    <button
                      onClick={() => ubahQty(b.key, 1)}
                      className="grid h-11 w-11 place-items-center rounded-xl shadow-neu-sm active:shadow-neu-in-sm"
                      aria-label={`Tambah ${b.name}`}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <button
                    onClick={() => setCatatanKey(catatanKey === b.key ? null : b.key)}
                    className="flex min-h-9 items-center gap-1 text-[11px] font-semibold text-muted hover:text-brand-700"
                  >
                    <StickyNote size={12} /> Catatan
                  </button>
                  <p className="uang text-sm font-bold">{rupiah((b.unitPrice + sumMod(b)) * b.qty)}</p>
                </div>
                {catatanKey === b.key && (
                  <Input
                    autoFocus
                    maxLength={200}
                    value={b.note}
                    placeholder="mis. tanpa es, dibungkus terpisah"
                    onChange={(e) => {
                      const v = e.target.value;
                      ubahBaris((kini) => kini.map((x) => (x.key === b.key ? { ...x, note: v } : x)));
                    }}
                    onKeyDown={(e) => e.key === "Enter" && setCatatanKey(null)}
                    className="mt-1 py-2 text-xs"
                  />
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-line px-5 py-4">
            <div className="space-y-1.5 text-sm">
              <Baris2 label="Subtotal" nilai={total.subtotal} />
              {total.service > 0 && <Baris2 label={`Service ${config.servicePercent}%`} nilai={total.service} />}
              {total.tax > 0 && (
                <Baris2
                  label={`${config.taxName ?? "Pajak"} ${config.taxPercent}%${config.taxInclusive ? " (termasuk)" : ""}`}
                  nilai={total.tax}
                />
              )}
              {total.rounding !== 0 && <Baris2 label="Pembulatan" nilai={total.rounding} />}
              <div className="flex items-end justify-between border-t border-dashed border-black/10 pt-2">
                <span className="text-sm font-bold">Total</span>
                <span className="uang text-grad text-2xl font-extrabold">{rupiah(total.grandTotal)}</span>
              </div>
              {mejaTerpilih && tipe === "DINE_IN" && <p className="text-right text-xs text-muted">Meja {mejaTerpilih.name}</p>}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={holdBill} disabled={loading || !baris.length || !online}>
                <PauseCircle size={16} /> Tahan
              </Button>
              {minimarket ? (
                <Button variant="outline" onClick={() => bukaBayar("QRIS")} disabled={loading || !baris.length || !online}>
                  QRIS (F8)
                </Button>
              ) : (
                <Button variant="outline" onClick={kirimDapur} disabled={loading || !baris.length || !online}>
                  <ChefHat size={16} /> Ke dapur
                </Button>
              )}
              <Button
                size="lg"
                className="col-span-2"
                onClick={() => bukaBayar("CASH")}
                disabled={loading || !baris.length}
              >
                Bayar {rupiah(total.grandTotal)} <span className="text-xs opacity-80">(F4)</span>
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Modal varian/modifier ── */}
      <Modal open={Boolean(pilihProduk)} onClose={() => setPilihProduk(null)} title={pilihProduk?.name}>
        {pilihProduk && (
          <div className="space-y-5">
            {pilihProduk.variants.length > 0 && (
              <PilihanGrup judul="Varian">
                {pilihProduk.variants.map((v) => (
                  <Chip key={v.id} aktif={varianId === v.id} onClick={() => setVarianId(varianId === v.id ? null : v.id)}>
                    {v.name} {v.priceDelta > 0 && `+${rupiah(v.priceDelta)}`}
                  </Chip>
                ))}
              </PilihanGrup>
            )}
            {pilihProduk.modifierGroups.map((g) => (
              <PilihanGrup key={g.id} judul={g.name} wajib={g.minSelect > 0} maks={g.maxSelect}>
                {g.modifiers.map((m) => {
                  const dipilih = (pilihanMod[g.id] ?? []).includes(m.id);
                  return (
                    <Chip
                      key={m.id}
                      aktif={dipilih}
                      onClick={() => {
                        const kini = pilihanMod[g.id] ?? [];
                        const baru = dipilih
                          ? kini.filter((x) => x !== m.id)
                          : g.maxSelect === 1
                            ? [m.id]
                            : [...kini, m.id].slice(0, g.maxSelect);
                        setPilihanMod({ ...pilihanMod, [g.id]: baru });
                      }}
                    >
                      {m.name} {m.priceDelta > 0 && `+${rupiah(m.priceDelta)}`}
                    </Chip>
                  );
                })}
              </PilihanGrup>
            ))}
            <Button className="w-full" size="lg" onClick={konfirmasiVarian}>
              Tambah ke pesanan
            </Button>
          </div>
        )}
      </Modal>

      {/* ── Modal pembayaran ── */}
      <Modal
        open={bayarOpen}
        onClose={() => {
          setBayarOpen(false);
          setStatusBayar("IDLE");
        }}
        title="Pembayaran"
      >
        {tagihan && (
          <div className="space-y-4">
            <div className="neu-in px-4 py-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Total tagihan</p>
              <p className="uang text-grad text-4xl font-extrabold">{rupiah(tagihan.grandTotal)}</p>
              <p className="text-[11px] text-muted">{tagihan.order?.orderNo ?? "Order offline"}</p>
            </div>

            <div className="neu-in grid grid-cols-2 gap-1 p-1 sm:grid-cols-4">
              {(["CASH", "QRIS", "BANK", "VA"] as const).map((m) => (
                <button
                  key={m}
                  disabled={(!online && m !== "CASH") || statusBayar === "MENUNGGU"}
                  title={!online && m !== "CASH" ? "QRIS butuh koneksi internet" : undefined}
                  onClick={() => {
                    setMetode(m);
                    setCharge(null);
                    setStatusBayar("IDLE");
                    if ((m === "QRIS" || m === "VA") && tagihan.order) void buatCharge(m, tagihan.order.id);
                  }}
                  className={clsx(
                    "min-h-11 rounded-xl text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40",
                    metode === m ? "bg-grad-brand text-white shadow-glow" : "text-muted",
                  )}
                >
                  {{ CASH: "Cash (F4)", QRIS: "QRIS (F8)", BANK: "Transfer Bank", VA: "Virtual Account" }[m]}
                </button>
              ))}
            </div>
            {!online && <p className="text-center text-xs text-amber-700">QRIS butuh koneksi internet</p>}

            {metode === "CASH" && (
              <div className="space-y-3">
                <div className="grid grid-cols-5 gap-2">
                  <NominalBtn onClick={() => setUang(tagihan.grandTotal)}>Uang pas</NominalBtn>
                  {NOMINAL_CEPAT.map((n) => (
                    <NominalBtn key={n} onClick={() => setUang(n)}>
                      {n / 1000}rb
                    </NominalBtn>
                  ))}
                </div>
                <Input
                  type="number"
                  inputMode="numeric"
                  aria-label="Uang diterima"
                  min={0}
                  step={1000}
                  value={uang || ""}
                  onChange={(e) => setUang(Math.max(0, Math.floor(Number(e.target.value))))}
                  className="uang text-right text-2xl font-extrabold"
                />
                <div
                  className={clsx(
                    "flex justify-between rounded-2xl px-4 py-3 text-base font-bold",
                    uang >= tagihan.grandTotal ? "bg-emerald-500/10 text-emerald-700" : "bg-rose-500/10 text-rose-600",
                  )}
                >
                  <span>{uang >= tagihan.grandTotal ? "Kembalian" : "Uang kurang"}</span>
                  <span className="uang">{rupiah(Math.abs(uang - tagihan.grandTotal))}</span>
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  variant="success"
                  onClick={bayarCash}
                  disabled={loading || uang < tagihan.grandTotal}
                >
                  {loading ? "Memproses…" : "Konfirmasi bayar cash (Enter)"}
                </Button>
              </div>
            )}

            {metode === "BANK" && (
              <div className="space-y-3">
                {!rekening.bankAccountNo ? (
                  <p className="neu-in p-4 text-sm text-amber-700">
                    Rekening toko belum diatur. Owner/Manager isi dulu di Pengaturan → Rekening transfer bank.
                  </p>
                ) : (
                  <div className="neu-in space-y-1 p-4 text-center">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Transfer ke {rekening.bankName}</p>
                    <p className="uang text-2xl font-extrabold tracking-wider">{rekening.bankAccountNo}</p>
                    <p className="text-sm text-muted">a.n. {rekening.bankAccountName}</p>
                    <button
                      onClick={() => void navigator.clipboard?.writeText(rekening.bankAccountNo.replace(/\D/g, ""))}
                      className="min-h-9 text-xs font-semibold text-brand-700 hover:text-brand-700"
                    >
                      Salin nomor rekening
                    </button>
                  </div>
                )}
                {statusBayar === "IDLE" || statusBayar === "GAGAL" ? (
                  <>
                    {statusBayar === "GAGAL" && <StatusBesar status="GAGAL" sub="Bukti ditolak, kirim ulang" />}
                    <label className="neu flex min-h-14 cursor-pointer items-center justify-center gap-2 px-4 text-sm font-semibold text-muted hover:text-fg">
                      {buktiFoto ? "Ganti foto bukti transfer" : "Foto / pilih bukti transfer"}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="sr-only"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          try {
                            setBuktiFoto(await kompresFoto(f));
                          } catch {
                            setError("Foto tidak bisa dibaca, coba foto lain");
                          }
                        }}
                      />
                    </label>
                    {buktiFoto && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={buktiFoto} alt="Pratinjau bukti transfer" className="mx-auto max-h-48 rounded-2xl" />
                    )}
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={kirimBukti}
                      disabled={!buktiFoto || loading || !rekening.bankAccountNo}
                    >
                      Kirim bukti transfer
                    </Button>
                  </>
                ) : (
                  <StatusBesar status={statusBayar} sub="Menunggu verifikasi dana masuk" />
                )}
                {statusBayar === "MENUNGGU" &&
                  (bolehApprove ? (
                    <Button className="w-full" size="lg" variant="success" onClick={setujuiTransfer} disabled={loading}>
                      Dana sudah masuk di rekening — Setujui
                    </Button>
                  ) : (
                    <p className="text-center text-xs text-muted">
                      Minta Manager/Owner cek mutasi rekening lalu setujui di menu Pesanan. Order tersimpan, layar ini
                      boleh ditutup — struk terbit otomatis setelah disetujui.
                    </p>
                  ))}
                {statusBayar === "MENUNGGU" && Date.now() > pollSampai && (
                  <Button variant="outline" className="w-full" onClick={() => setPollSampai(Date.now() + POLLING_DURASI_MS)}>
                    Cek status lagi
                  </Button>
                )}
              </div>
            )}

            {(metode === "QRIS" || metode === "VA") && (
              <div className="space-y-3 text-center">
                <StatusBesar status={statusBayar} />
                {charge && statusBayar === "MENUNGGU" && (
                  <>
                    {charge.qrImageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={charge.qrImageUrl}
                        alt="QR pembayaran QRIS"
                        className="mx-auto h-56 w-56 rounded-2xl bg-white p-2"
                      />
                    )}
                    {charge.vaNumber && (
                      <div className="neu-in py-3">
                        <p className="text-xs text-muted">Nomor Virtual Account</p>
                        <p className="uang text-2xl font-extrabold tracking-wider">{charge.vaNumber}</p>
                      </div>
                    )}
                    <p className="text-sm text-muted">
                      Berlaku <span className="uang font-bold text-fg">{menitDetik}</span> lagi •{" "}
                      {modeDev ? "mode demo: pakai tombol simulasi" : "status otomatis dari gateway"}
                    </p>
                    {Date.now() > pollSampai && (
                      <Button variant="outline" className="w-full" onClick={() => setPollSampai(Date.now() + POLLING_DURASI_MS)}>
                        Cek status lagi
                      </Button>
                    )}
                    {modeDev && (
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" size="sm" onClick={() => simulasi("settlement")}>
                          Simulasi lunas (demo)
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => simulasi("expire")}>
                          Simulasi expire (demo)
                        </Button>
                      </div>
                    )}
                  </>
                )}
                {(statusBayar === "KEDALUWARSA" || statusBayar === "GAGAL") && tagihan.order && (
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => tagihan.order && buatCharge(metode as "QRIS" | "VA", tagihan.order.id)}
                    disabled={loading}
                  >
                    {metode === "QRIS" ? "Buat QR Baru" : "Buat VA Baru"}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Bill tertahan ── */}
      <Modal open={tertahan !== null} onClose={() => setTertahan(null)} title="Bill tertahan">
        {tertahan && !tertahan.length && <Empty>Tidak ada bill tertahan.</Empty>}
        <div className="space-y-2">
          {tertahan?.map((o) => (
            <a
              key={o.id}
              href={`/pos?order=${o.id}`}
              className="neu flex min-h-14 items-center justify-between px-4 py-3 hover:text-brand-700"
            >
              <div>
                <p className="text-sm font-bold">{o.orderNo}</p>
                <p className="text-[11px] text-muted">{o.status === "CONFIRMED" ? "Di dapur" : "Draft"}</p>
              </div>
              <span className="uang font-bold">{rupiah(o.grandTotal)}</span>
            </a>
          ))}
        </div>
      </Modal>

      {/* ── Struk ── */}
      <Modal open={Boolean(struk)} onClose={() => setStruk(null)} title="Struk" wide>
        {struk && (
          <div className="space-y-4">
            <StatusBesar status="LUNAS" sub={struk.data?.receiptNo} />
            {kembalian !== null && kembalian > 0 && (
              <div className="flex justify-between rounded-2xl bg-emerald-500/10 px-4 py-3 text-lg font-bold text-emerald-700">
                <span>Kembalian</span>
                <span className="uang">{rupiah(kembalian)}</span>
              </div>
            )}
            <pre className="struk mx-auto max-h-[46vh] w-fit overflow-auto rounded-2xl p-4">{struk.teks}</pre>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => cetakDiBrowser(struk.teks, struk.data?.receiptNo)}>
                Cetak / PDF
              </Button>
              {struk.data && (
                <>
                  <Button variant="outline" onClick={cetakUlang}>
                    Cetak ulang (printer)
                  </Button>
                  <a href={`/api/receipts/${struk.data.id}/pdf`} target="_blank" rel="noreferrer">
                    <Button variant="outline">Unduh PDF</Button>
                  </a>
                  <a href={`/r/${struk.data.digitalToken}`} target="_blank" rel="noreferrer">
                    <Button variant="ghost">Struk digital</Button>
                  </a>
                </>
              )}
              <Button className="ml-auto" onClick={() => setStruk(null)}>
                Transaksi baru
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Toast pesan={error} />
      <Toast pesan={info} tone="ok" />
      {error && (
        <button className="fixed inset-0 z-40 cursor-default" onClick={() => setError(null)} aria-label="Tutup pesan" />
      )}
    </div>
  );
}

function Baris2({ label, nilai }: { label: string; nilai: number }) {
  return (
    <div className="flex justify-between text-muted">
      <span>{label}</span>
      <span className="uang">{rupiah(nilai)}</span>
    </div>
  );
}

function PilihanGrup({
  judul,
  wajib,
  maks,
  children,
}: {
  judul: string;
  wajib?: boolean;
  maks?: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
        {judul} {wajib && <span className="text-rose-600">*</span>}
        {maks && maks > 1 && <span className="normal-case"> (maks {maks})</span>}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ aktif, onClick, children }: { aktif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "min-h-11 rounded-2xl px-4 text-sm font-semibold transition",
        aktif ? "bg-grad-brand text-white shadow-glow" : "bg-base-800 text-muted shadow-neu-sm hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function NominalBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="min-h-11 rounded-xl text-xs font-bold text-muted shadow-neu-sm hover:text-brand-700 active:shadow-neu-in-sm"
    >
      {children}
    </button>
  );
}

function StatusBesar({ status, sub }: { status: StatusBayar; sub?: string }) {
  if (status === "IDLE") return null;
  const gaya = {
    MENUNGGU: { label: "MENUNGGU", kelas: "bg-amber-500/10 text-amber-700 ring-amber-400/30 animate-pulse" },
    LUNAS: { label: "LUNAS", kelas: "bg-emerald-500/10 text-emerald-700 ring-emerald-400/30" },
    GAGAL: { label: "GAGAL", kelas: "bg-rose-500/10 text-rose-600 ring-rose-400/30" },
    KEDALUWARSA: { label: "KEDALUWARSA", kelas: "bg-black/5 text-muted ring-black/10" },
  }[status];
  return (
    <div className={clsx("rounded-2xl px-4 py-4 text-center ring-1", gaya.kelas)} role="status" aria-live="polite">
      <p className="text-3xl font-black tracking-widest">{gaya.label}</p>
      {sub && <p className="mt-1 text-xs opacity-80">{sub}</p>}
      {status === "KEDALUWARSA" && <p className="mt-1 text-xs">Order tetap belum dibayar. Buat QR baru.</p>}
    </div>
  );
}

export { Badge };
