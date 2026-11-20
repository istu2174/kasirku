"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Printer, RefreshCw } from "lucide-react";
import { api, angka, rupiah } from "@/lib/client";
import { jam, tanggalWaktu } from "@/lib/format";
import { Badge, Button, Card, Empty, PageHeader, Stat, StatusPill, Toast } from "@/components/ui";

type Dashboard = {
  hariIni: { tanggal: string; omzet: number; transaksi: number; rataRata: number; perMetode: Record<string, number> };
  kemarin: { omzet: number };
  terlaris: { name: string; qty: number; omzet: number }[];
  stokKritis: { id: string; name: string; qty: number; minQty: number }[];
  stokKritisTotal: number;
  voidHariIni: number;
  perluReview: {
    id: string;
    orderNo: string;
    grandTotal: number;
    createdAt: string;
    bayar: { method: string; amount: number; status: string } | null;
  }[];
  printGagal: { id: string; receiptNo: string; attempts: number; error: string | null; createdAt: string }[];
};

const LABEL_METODE: Record<string, string> = {
  CASH: "Tunai",
  QRIS: "QRIS",
  VA: "Virtual Account",
  MANUAL_TRANSFER: "Transfer Manual",
  EWALLET: "E-Wallet",
};

const INTERVAL_MS = 15_000;

export default function DashboardClient() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diperbarui, setDiperbarui] = useState<Date | null>(null);
  const [memuat, setMemuat] = useState(false);

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      setData(await api<Dashboard>("/api/reports/dashboard"));
      setDiperbarui(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat dashboard");
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    void muat();
    const t = setInterval(() => void muat(), INTERVAL_MS);
    return () => clearInterval(t);
  }, [muat]);

  const selisih = data && data.kemarin.omzet > 0 ? ((data.hariIni.omzet - data.kemarin.omzet) / data.kemarin.omzet) * 100 : null;
  const metode = data ? Object.entries(data.hariIni.perMetode).sort((a, b) => b[1] - a[1]) : [];
  const maxMetode = Math.max(1, ...metode.map(([, v]) => v));

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Dashboard"
        subtitle={`Ringkasan hari ini (WIB)${diperbarui ? ` · diperbarui ${jam(diperbarui)}, otomatis tiap 15 detik` : ""}`}
        actions={
          <Button variant="outline" onClick={() => void muat()} disabled={memuat}>
            <RefreshCw size={16} className={memuat ? "animate-spin" : undefined} /> Muat ulang
          </Button>
        }
      />

      {!data ? (
        <Empty>{error ?? "Memuat dashboard..."}</Empty>
      ) : (
        <div className="space-y-6">
          {(data.perluReview.length > 0 || data.printGagal.length > 0) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.perluReview.length > 0 && (
                <Card className="p-5 ring-1 ring-rose-400/30">
                  <div className="mb-3 flex items-center gap-2">
                    <AlertTriangle size={18} className="text-rose-300" />
                    <h2 className="font-bold text-fg">Pembayaran perlu review</h2>
                    <Badge tone="red">{data.perluReview.length}</Badge>
                  </div>
                  <p className="mb-3 text-xs text-muted">Nominal pembayaran tidak cocok dengan total order. Cek mutasi sebelum diproses.</p>
                  <ul className="space-y-2">
                    {data.perluReview.map((o) => (
                      <li key={o.id} className="neu-in flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                        <div>
                          <p className="font-semibold text-fg">{o.orderNo}</p>
                          <p className="text-xs text-muted">{tanggalWaktu(o.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="uang">
                            Total {rupiah(o.grandTotal)}
                            {o.bayar && (
                              <>
                                {" · "}
                                {LABEL_METODE[o.bayar.method] ?? o.bayar.method} {rupiah(o.bayar.amount)}
                              </>
                            )}
                          </p>
                          {o.bayar && <StatusPill status={o.bayar.status} />}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <Link href="/orders" className="mt-3 inline-block text-sm font-semibold text-brand-200 hover:underline">
                    Buka daftar pesanan
                  </Link>
                </Card>
              )}
              {data.printGagal.length > 0 && (
                <Card className="p-5 ring-1 ring-amber-400/30">
                  <div className="mb-3 flex items-center gap-2">
                    <Printer size={18} className="text-amber-300" />
                    <h2 className="font-bold text-fg">Cetak struk gagal</h2>
                    <Badge tone="amber">{data.printGagal.length}</Badge>
                  </div>
                  <ul className="space-y-2">
                    {data.printGagal.map((j) => (
                      <li key={j.id} className="neu-in px-4 py-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-fg">{j.receiptNo}</span>
                          <span className="text-xs text-muted">
                            {tanggalWaktu(j.createdAt)} · {j.attempts}x percobaan
                          </span>
                        </div>
                        {j.error && <p className="mt-1 text-xs text-rose-300">{j.error}</p>}
                      </li>
                    ))}
                  </ul>
                  <Link href="/receipts" className="mt-3 inline-block text-sm font-semibold text-brand-200 hover:underline">
                    Cetak ulang di menu Struk
                  </Link>
                </Card>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Omzet hari ini"
              value={rupiah(data.hariIni.omzet)}
              accent
              hint={
                selisih === null
                  ? `Kemarin ${rupiah(data.kemarin.omzet)}`
                  : `${selisih >= 0 ? "+" : ""}${selisih.toFixed(1)}% vs kemarin (${rupiah(data.kemarin.omzet)})`
              }
            />
            <Stat label="Transaksi" value={angka(data.hariIni.transaksi)} hint="Order lunas hari ini" />
            <Stat label="Rata-rata / transaksi" value={rupiah(data.hariIni.rataRata)} />
            <Stat label="Void / refund hari ini" value={angka(data.voidHariIni)} hint="Detail di menu Laporan" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-4 font-bold text-fg">Omzet per metode bayar</h2>
              <ul className="space-y-4">
                {metode.map(([m, v]) => (
                  <li key={m}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="text-muted">{LABEL_METODE[m] ?? m}</span>
                      <span className="uang font-semibold text-fg">{rupiah(v)}</span>
                    </div>
                    <div className="neu-in h-3 overflow-hidden rounded-full" role="presentation">
                      <div
                        className="h-full rounded-full bg-grad-brand shadow-glow transition-all"
                        style={{ width: `${(Math.max(0, v) / maxMetode) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-5">
              <h2 className="mb-4 font-bold text-fg">Produk terlaris</h2>
              {data.terlaris.length === 0 ? (
                <Empty>Belum ada penjualan hari ini.</Empty>
              ) : (
                <table className="tabel">
                  <thead>
                    <tr>
                      <th>Produk</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Omzet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.terlaris.map((t) => (
                      <tr key={t.name}>
                        <td className="text-fg">{t.name}</td>
                        <td className="uang text-right">{angka(t.qty)}</td>
                        <td className="uang text-right">{rupiah(t.omzet)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-fg">
                Stok kritis{" "}
                {data.stokKritisTotal > 0 && <Badge tone="amber">{data.stokKritisTotal}</Badge>}
              </h2>
              <Link href="/stock" className="text-sm font-semibold text-brand-200 hover:underline">
                Kelola stok
              </Link>
            </div>
            {data.stokKritis.length === 0 ? (
              <Empty>Semua stok aman.</Empty>
            ) : (
              <table className="tabel">
                <thead>
                  <tr>
                    <th>Produk</th>
                    <th className="text-right">Sisa</th>
                    <th className="text-right">Minimum</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stokKritis.map((s) => (
                    <tr key={s.id}>
                      <td className="text-fg">{s.name}</td>
                      <td className="uang text-right">
                        <Badge tone={s.qty <= 0 ? "red" : "amber"}>{angka(s.qty)}</Badge>
                      </td>
                      <td className="uang text-right text-muted">{angka(s.minQty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {data.stokKritisTotal > data.stokKritis.length && (
              <p className="mt-3 text-xs text-muted">Menampilkan {data.stokKritis.length} dari {data.stokKritisTotal} produk.</p>
            )}
          </Card>
        </div>
      )}
      <Toast pesan={data ? error : null} />
    </div>
  );
}
