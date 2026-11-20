"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { api, angka, rupiah } from "@/lib/client";
import { dateKey, tanggalWaktu } from "@/lib/format";
import { Badge, Button, Card, Empty, Field, Input, PageHeader, Stat, Toast } from "@/components/ui";

type GroupBy = "product" | "category" | "cashier" | "hour" | "method";
type Sales = { baris: { label: string; qty: number; total: number }[]; totalOmzet: number; jumlahOrder: number };
type VoidRefund = {
  refunds: { id: string; orderNo: string; metode: string; jumlah: number; alasan: string; status: string; oleh: string; waktu: string }[];
  batal: { id: string; orderNo: string; total: number; alasan: string; kasir: string; waktu: string }[];
};

const GROUP: { key: GroupBy; label: string; kolom: string; qty: string }[] = [
  { key: "product", label: "Produk", kolom: "Produk", qty: "Qty" },
  { key: "category", label: "Kategori", kolom: "Kategori", qty: "Qty" },
  { key: "cashier", label: "Kasir", kolom: "Kasir", qty: "Order" },
  { key: "hour", label: "Jam", kolom: "Jam", qty: "Order" },
  { key: "method", label: "Metode bayar", kolom: "Metode", qty: "Pembayaran" },
];

/** Tanggal WIB "YYYY-MM-DD", mundur n hari dari hari ini. */
const tglMundur = (n: number) => {
  const k = dateKey(new Date(Date.now() - n * 86_400_000));
  return `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
};

// Tampilan Button outline, tapi elemen <a> supaya jadi link download asli.
const kelasLink =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-base-800 px-4 text-sm font-semibold text-fg shadow-neu-sm transition hover:text-brand-200";

const PRESET = [
  { label: "Hari ini", hari: 0 },
  { label: "7 hari", hari: 6 },
  { label: "30 hari", hari: 29 },
];

export default function ReportsClient() {
  const [dari, setDari] = useState(tglMundur(0));
  const [sampai, setSampai] = useState(tglMundur(0));
  const [groupBy, setGroupBy] = useState<GroupBy>("product");
  const [sales, setSales] = useState<Sales | null>(null);
  const [vr, setVr] = useState<VoidRefund | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rentang = `from=${dari}&to=${sampai}`;

  const muat = useCallback(async () => {
    try {
      const [s, v] = await Promise.all([
        api<Sales>(`/api/reports/sales?groupBy=${groupBy}&${rentang}`),
        api<VoidRefund>(`/api/reports/sales?type=refunds&${rentang}`),
      ]);
      setSales(s);
      setVr(v);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat laporan");
    }
  }, [groupBy, rentang]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const g = GROUP.find((x) => x.key === groupBy) ?? GROUP[0];
  const totalRefund = vr?.refunds.reduce((s, r) => s + r.jumlah, 0) ?? 0;

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Laporan"
        subtitle="Penjualan, void & refund per rentang tanggal (WIB)"
        actions={
          <>
            <a href={`/api/reports/export?type=sales&${rentang}`} download className={kelasLink}>
              <Download size={16} /> CSV penjualan
            </a>
            <a href={`/api/reports/export?type=refunds&${rentang}`} download className={kelasLink}>
              <Download size={16} /> CSV void/refund
            </a>
          </>
        }
      />

      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-44">
            <Field label="Dari">
              <Input type="date" value={dari} max={sampai} onChange={(e) => e.target.value && setDari(e.target.value)} />
            </Field>
          </div>
          <div className="w-full sm:w-44">
            <Field label="Sampai">
              <Input type="date" value={sampai} min={dari} onChange={(e) => e.target.value && setSampai(e.target.value)} />
            </Field>
          </div>
          {PRESET.map((p) => {
            const aktif = dari === tglMundur(p.hari) && sampai === tglMundur(0);
            return (
              <Button
                key={p.label}
                variant={aktif ? "primary" : "outline"}
                onClick={() => {
                  setDari(tglMundur(p.hari));
                  setSampai(tglMundur(0));
                }}
              >
                {p.label}
              </Button>
            );
          })}
        </div>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Omzet" value={rupiah(sales?.totalOmzet ?? 0)} accent hint="Order lunas, refund penuh tidak dihitung" />
        <Stat label="Jumlah order" value={angka(sales?.jumlahOrder ?? 0)} />
        <Stat
          label="Total refund"
          value={rupiah(totalRefund)}
          hint={`${vr?.refunds.length ?? 0} refund · ${vr?.batal.length ?? 0} order batal`}
        />
      </div>

      <Card className="mb-6 p-5">
        <div className="mb-4 flex flex-wrap gap-2" role="tablist">
          {GROUP.map((x) => (
            <Button
              key={x.key}
              role="tab"
              aria-selected={groupBy === x.key}
              variant={groupBy === x.key ? "primary" : "ghost"}
              onClick={() => setGroupBy(x.key)}
            >
              {x.label}
            </Button>
          ))}
        </div>
        {!sales ? (
          <Empty>Memuat...</Empty>
        ) : sales.baris.length === 0 ? (
          <Empty>Tidak ada penjualan di rentang ini.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabel">
              <thead>
                <tr>
                  <th>{g.kolom}</th>
                  <th className="text-right">{g.qty}</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.baris.map((b) => (
                  <tr key={b.label}>
                    <td className="text-fg">{b.label}</td>
                    <td className="uang text-right">{angka(b.qty)}</td>
                    <td className="uang text-right">{rupiah(b.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 font-bold text-fg">Void &amp; refund</h2>
        {!vr ? (
          <Empty>Memuat...</Empty>
        ) : vr.refunds.length + vr.batal.length === 0 ? (
          <Empty>Tidak ada void atau refund di rentang ini.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabel">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Jenis</th>
                  <th>No order</th>
                  <th className="text-right">Jumlah</th>
                  <th>Alasan</th>
                  <th>Oleh</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...vr.refunds.map((r) => ({
                    id: r.id,
                    waktu: r.waktu,
                    jenis: <Badge tone="red">Refund {r.metode}</Badge>,
                    orderNo: r.orderNo,
                    jumlah: r.jumlah,
                    alasan: r.alasan,
                    oleh: `${r.oleh} (approver)`,
                  })),
                  ...vr.batal.map((b) => ({
                    id: b.id,
                    waktu: b.waktu,
                    jenis: <Badge tone="neutral">Batal</Badge>,
                    orderNo: b.orderNo,
                    jumlah: b.total,
                    alasan: b.alasan,
                    oleh: `${b.kasir} (kasir)`,
                  })),
                ]
                  .sort((a, b) => b.waktu.localeCompare(a.waktu))
                  .map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap text-muted">{tanggalWaktu(r.waktu)}</td>
                      <td>{r.jenis}</td>
                      <td className="text-fg">{r.orderNo}</td>
                      <td className="uang text-right">{rupiah(r.jumlah)}</td>
                      <td className="min-w-[12rem]">{r.alasan}</td>
                      <td className="whitespace-nowrap text-muted">{r.oleh}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Toast pesan={error} />
    </div>
  );
}
