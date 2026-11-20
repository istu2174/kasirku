"use client";

import { clsx } from "clsx";
import { useCallback, useEffect, useState } from "react";
import { Printer, X } from "lucide-react";
import { api, rupiah } from "@/lib/client";
import { tanggalWaktu } from "@/lib/format";
import { Button, Card, Empty, Field, Input, Modal, PageHeader, Stat, StatusPill, Textarea, Toast } from "@/components/ui";
import { teksLaporanShift, type LaporanShift } from "./laporan";

type ShiftAktif = {
  id: string;
  openedAt: string;
  openingCash: number;
  user: { name: string };
};

type Ringkas = { total: number; transaksi: number; cash: number; nonCash: number; expectedCash: number };

type Riwayat = {
  id: string;
  openedAt: string;
  closedAt: string | null;
  openingCash: number;
  expectedCash: number;
  countedCash: number | null;
  difference: number | null;
  user: { name: string };
};

const MODAL_CEPAT = [200_000, 500_000, 1_000_000];
const PECAHAN = [100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000];

const keAngka = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
const uang = (n: number) => (n < 0 ? "-" + rupiah(-n) : rupiah(n));

export default function ShiftClient() {
  const [data, setData] = useState<{ shift: ShiftAktif | null; ringkas: Ringkas | null; riwayat: Riwayat[] } | null>(null);
  const [modalAwal, setModalAwal] = useState("");
  const [laporan, setLaporan] = useState<LaporanShift | null>(null);
  const [tutupBuka, setTutupBuka] = useState(false);
  const [lembar, setLembar] = useState<Record<number, string>>({});
  const [koin, setKoin] = useState("");
  const [catatan, setCatatan] = useState("");
  const [kasSeharusnya, setKasSeharusnya] = useState<number | null>(null);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [toast, setToast] = useState<{ pesan: string; tone: "error" | "ok" } | null>(null);

  const gagal = (e: unknown) => setToast({ pesan: e instanceof Error ? e.message : "Terjadi kesalahan", tone: "error" });

  const muat = useCallback(async () => {
    try {
      setData(await api("/api/shifts"));
    } catch (e) {
      gagal(e);
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function ambilLaporan(id: string, tipe: "X" | "Z") {
    try {
      setLaporan(await api<LaporanShift>(`/api/shifts/${id}/report?type=${tipe}`));
    } catch (e) {
      gagal(e);
    }
  }

  async function bukaShift() {
    setSibuk(true);
    try {
      await api("/api/shifts", { method: "POST", body: JSON.stringify({ openingCash: keAngka(modalAwal) }) });
      setModalAwal("");
      setLaporan(null);
      setToast({ pesan: "Shift dibuka", tone: "ok" });
      await muat();
    } catch (e) {
      gagal(e);
    } finally {
      setSibuk(false);
    }
  }

  async function mulaiTutup(id: string) {
    setLembar({});
    setKoin("");
    setCatatan("");
    setKonfirmasi(false);
    setKasSeharusnya(null);
    setTutupBuka(true);
    try {
      const x = await api<LaporanShift>(`/api/shifts/${id}/report?type=X`);
      setKasSeharusnya(x.kasSeharusnya);
    } catch (e) {
      gagal(e);
    }
  }

  const totalFisik = PECAHAN.reduce((s, p) => s + p * keAngka(lembar[p] ?? ""), 0) + keAngka(koin);
  const selisih = kasSeharusnya === null ? null : totalFisik - kasSeharusnya;

  async function tutupShift(id: string) {
    setSibuk(true);
    try {
      await api("/api/shifts/close", {
        method: "POST",
        body: JSON.stringify({ shiftId: id, countedCash: totalFisik, note: catatan.trim() || undefined }),
      });
      setTutupBuka(false);
      setToast({ pesan: "Shift ditutup", tone: "ok" });
      await Promise.all([muat(), ambilLaporan(id, "Z")]);
    } catch (e) {
      gagal(e);
    } finally {
      setSibuk(false);
    }
  }

  const shift = data?.shift ?? null;

  return (
    <div className="p-4 lg:p-8">
      {/* Saat cetak hanya struk laporan yang tampil (sidebar AppShell tidak punya class no-print). */}
      <style>{`@media print { body * { visibility: hidden; } .area-cetak, .area-cetak * { visibility: visible; } .area-cetak { position: absolute; left: 0; top: 0; } }`}</style>

      <div className="no-print">
        <PageHeader title="Shift & Kas" subtitle="Buka/tutup shift, hitung kas, laporan X & Z" />

        {data === null ? (
          <Empty>Memuat shift…</Empty>
        ) : shift ? (
          <Card className="mb-6 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-fg">Shift aktif</h2>
                  <StatusPill status="OPEN" />
                </div>
                <p className="mt-1 text-sm text-muted">
                  Dibuka {tanggalWaktu(shift.openedAt)} oleh {shift.user.name}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void ambilLaporan(shift.id, "X")}>
                  Laporan X
                </Button>
                <Button variant="danger" onClick={() => void mulaiTutup(shift.id)}>
                  Tutup shift
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat label="Modal awal" value={rupiah(shift.openingCash)} />
              <Stat label="Penjualan" value={rupiah(data.ringkas?.total ?? 0)} hint={`${data.ringkas?.transaksi ?? 0} transaksi`} />
              <Stat label="Tunai masuk" value={rupiah(data.ringkas?.cash ?? 0)} hint={`Non-tunai ${rupiah(data.ringkas?.nonCash ?? 0)}`} />
              <Stat label="Kas di laci (sistem)" value={rupiah(data.ringkas?.expectedCash ?? 0)} accent hint="Angka final (setelah refund tunai) ada di Laporan X" />
            </div>
          </Card>
        ) : (
          <Card className="mb-6 p-5">
            <h2 className="mb-1 text-lg font-bold text-fg">Belum ada shift aktif</h2>
            <p className="mb-4 text-sm text-muted">Masukkan modal awal kas di laci untuk membuka shift.</p>
            <div className="max-w-md space-y-3">
              <Field label="Modal awal (Rp)">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1000}
                  value={modalAwal}
                  onChange={(e) => setModalAwal(e.target.value)}
                  placeholder="0"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                {MODAL_CEPAT.map((n) => (
                  <Button key={n} variant="outline" onClick={() => setModalAwal(String(n))}>
                    {n >= 1_000_000 ? `${n / 1_000_000}jt` : `${n / 1000}rb`}
                  </Button>
                ))}
              </div>
              <p className="uang text-sm text-muted">Modal: {rupiah(keAngka(modalAwal))}</p>
              <Button size="lg" className="w-full" disabled={sibuk} onClick={() => void bukaShift()}>
                Buka shift
              </Button>
            </div>
          </Card>
        )}
      </div>

      {laporan && (
        <Card className="mb-6 p-5">
          <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-fg">Laporan {laporan.tipe}</h2>
            <div className="flex gap-2">
              <Button onClick={() => window.print()}>
                <Printer size={16} /> Cetak
              </Button>
              <Button variant="ghost" onClick={() => setLaporan(null)} aria-label="Tutup laporan">
                <X size={16} />
              </Button>
            </div>
          </div>
          <div className="flex justify-center">
            <pre className="struk area-cetak rounded-xl p-4">{teksLaporanShift(laporan)}</pre>
          </div>
        </Card>
      )}

      <div className="no-print">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Riwayat shift</h2>
        {data && data.riwayat.length === 0 ? (
          <Empty>Belum ada shift yang ditutup.</Empty>
        ) : (
          <Card className="overflow-x-auto p-2">
            <table className="tabel">
              <thead>
                <tr>
                  <th>Dibuka</th>
                  <th>Ditutup</th>
                  <th>Kasir</th>
                  <th className="text-right">Modal</th>
                  <th className="text-right">Kas seharusnya</th>
                  <th className="text-right">Kas fisik</th>
                  <th className="text-right">Selisih</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(data?.riwayat ?? []).map((r) => (
                  <tr key={r.id}>
                    <td>{tanggalWaktu(r.openedAt)}</td>
                    <td>{r.closedAt ? tanggalWaktu(r.closedAt) : "-"}</td>
                    <td>{r.user.name}</td>
                    <td className="uang text-right">{rupiah(r.openingCash)}</td>
                    <td className="uang text-right">{rupiah(r.expectedCash)}</td>
                    <td className="uang text-right">{r.countedCash === null ? "-" : rupiah(r.countedCash)}</td>
                    <td className={clsx("uang text-right font-semibold", (r.difference ?? 0) < 0 && "text-rose-400")}>
                      {r.difference === null ? "-" : uang(r.difference)}
                    </td>
                    <td className="text-right">
                      <Button size="sm" variant="outline" className="min-h-11" onClick={() => void ambilLaporan(r.id, "Z")}>
                        Laporan Z
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {shift && (
        <Modal open={tutupBuka} onClose={() => setTutupBuka(false)} title="Tutup shift" wide>
          {!konfirmasi ? (
            <div className="space-y-4">
              <p className="text-sm text-muted">Hitung uang fisik di laci per pecahan.</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {PECAHAN.map((p) => (
                  <div key={p} className="flex items-center gap-3">
                    <span className="uang w-24 shrink-0 text-sm font-semibold text-fg">{rupiah(p)}</span>
                    <span className="text-muted">×</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      aria-label={`Jumlah lembar ${rupiah(p)}`}
                      value={lembar[p] ?? ""}
                      onChange={(e) => setLembar((l) => ({ ...l, [p]: e.target.value }))}
                      placeholder="0"
                    />
                    <span className="uang w-28 shrink-0 text-right text-sm text-muted">
                      {rupiah(p * keAngka(lembar[p] ?? ""))}
                    </span>
                  </div>
                ))}
                <div className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-sm font-semibold text-fg">Koin (Rp)</span>
                  <span className="invisible">×</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    aria-label="Total koin dalam rupiah"
                    value={koin}
                    onChange={(e) => setKoin(e.target.value)}
                    placeholder="0"
                  />
                  <span className="w-28 shrink-0" />
                </div>
              </div>

              <div className="neu-in space-y-2 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Total kas fisik</span>
                  <span className="uang font-bold text-fg">{rupiah(totalFisik)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Kas seharusnya</span>
                  <span className="uang font-bold text-fg">{kasSeharusnya === null ? "…" : rupiah(kasSeharusnya)}</span>
                </div>
                <div className="flex justify-between border-t border-line pt-2 text-base">
                  <span className="font-bold text-fg">Selisih</span>
                  <span
                    className={clsx(
                      "uang font-extrabold",
                      selisih === null ? "text-muted" : selisih < 0 ? "text-rose-400" : selisih > 0 ? "text-amber-300" : "text-emerald-300",
                    )}
                  >
                    {selisih === null ? "…" : uang(selisih)}
                  </span>
                </div>
              </div>

              <Field label="Catatan (opsional)">
                <Textarea rows={2} maxLength={300} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
              </Field>

              <Button size="lg" className="w-full" disabled={kasSeharusnya === null} onClick={() => setKonfirmasi(true)}>
                Lanjut
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-fg">
                Yakin menutup shift? Setelah ditutup, transaksi baru butuh shift baru dan data kas tidak bisa diubah.
              </p>
              <div className="neu-in space-y-2 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Kas fisik</span>
                  <span className="uang font-bold">{rupiah(totalFisik)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Selisih</span>
                  <span className={clsx("uang font-extrabold", (selisih ?? 0) < 0 ? "text-rose-400" : "text-fg")}>
                    {uang(selisih ?? 0)}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" disabled={sibuk} onClick={() => setKonfirmasi(false)}>
                  Kembali
                </Button>
                <Button variant="danger" disabled={sibuk} onClick={() => void tutupShift(shift.id)}>
                  Ya, tutup shift
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
