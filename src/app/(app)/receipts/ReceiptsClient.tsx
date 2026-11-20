"use client";

import { cetakDiBrowser } from "@/lib/cetak-browser";
import { useCallback, useEffect, useState } from "react";
import { clsx } from "clsx";
import { Download, Printer, RefreshCw } from "lucide-react";
import { api, rupiah } from "@/lib/client";
import { tanggalWaktu } from "@/lib/format";
import { teksStruk, type ReceiptPayload } from "@/lib/struk";
import { Badge, Button, Card, Empty, Modal, PageHeader, StatusPill, Toast } from "@/components/ui";

type StrukRow = {
  id: string;
  receiptNo: string;
  kind: "SALE" | "VOID" | "REFUND";
  issuedAt: string;
  printedCount: number;
  payloadJson: string;
  order: { orderNo: string; grandTotal: number; status: string };
  jobs: { id: string; status: string; error: string | null; attempts: number; createdAt: string }[];
};

const JENIS: Record<StrukRow["kind"], { label: string; tone: "blue" | "red" | "neutral" }> = {
  SALE: { label: "Penjualan", tone: "blue" },
  REFUND: { label: "Refund", tone: "red" },
  VOID: { label: "Pembatalan", tone: "neutral" },
};

export default function ReceiptsClient() {
  const [daftar, setDaftar] = useState<StrukRow[] | null>(null);
  const [pilihId, setPilihId] = useState<string | null>(null);
  const [lebar, setLebar] = useState<32 | 48>(32);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [toast, setToast] = useState<{ pesan: string; tone: "error" | "ok" } | null>(null);

  const kabar = (pesan: string, tone: "error" | "ok" = "error") => {
    setToast({ pesan, tone });
    setTimeout(() => setToast(null), 3500);
  };

  const muat = useCallback(async () => {
    try {
      const d = await api<{ receipts: StrukRow[] }>("/api/receipts?limit=100");
      setDaftar(d.receipts);
      setPilihId((id) => id ?? d.receipts[0]?.id ?? null);
    } catch (e) {
      setDaftar([]);
      setToast({ pesan: (e as Error).message, tone: "error" });
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  const pilih = daftar?.find((r) => r.id === pilihId) ?? null;
  const payload = pilih ? (JSON.parse(pilih.payloadJson) as ReceiptPayload) : null;
  const jobTerakhir = pilih?.jobs[0];
  const urlDigital = payload ? `${window.location.origin}${payload.digitalUrl}` : "";

  const cetakUlang = async () => {
    if (!pilih) return;
    setSibuk(true);
    try {
      await api(`/api/receipts/${pilih.id}/print`, { method: "POST" });
      kabar(`Cetak ulang ${pilih.receiptNo} masuk antrean`, "ok");
      await muat();
    } catch (e) {
      kabar((e as Error).message);
    } finally {
      setSibuk(false);
      setKonfirmasi(false);
    }
  };

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Struk"
        subtitle="Struk bersifat permanen: tidak bisa diubah atau dihapus. Cetak ulang ditandai REPRINT."
        actions={
          <Button variant="outline" onClick={() => void muat()}>
            <RefreshCw size={16} aria-hidden /> Muat ulang
          </Button>
        }
      />

      {daftar === null ? (
        <Empty>Memuat struk…</Empty>
      ) : daftar.length === 0 ? (
        <Empty>Belum ada struk yang terbit.</Empty>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
          <Card className="overflow-x-auto p-2">
            <table className="tabel">
              <thead>
                <tr>
                  <th>No. struk</th>
                  <th>Waktu</th>
                  <th>Order</th>
                  <th className="text-right">Total</th>
                  <th>Jenis</th>
                  <th>Cetak</th>
                </tr>
              </thead>
              <tbody>
                {daftar.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setPilihId(r.id)}
                    className={clsx("cursor-pointer", r.id === pilihId && "bg-brand-500/10")}
                  >
                    <td>
                      <button className="min-h-11 text-left font-semibold text-fg hover:text-brand-700">{r.receiptNo}</button>
                    </td>
                    <td className="text-muted">{tanggalWaktu(r.issuedAt)}</td>
                    <td className="text-muted">{r.order.orderNo}</td>
                    <td className="uang text-right font-semibold">{rupiah(r.order.grandTotal)}</td>
                    <td>
                      <Badge tone={JENIS[r.kind].tone}>{JENIS[r.kind].label}</Badge>
                    </td>
                    <td>{r.jobs[0] ? <StatusPill status={r.jobs[0].status} /> : <span className="text-muted">-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {pilih && payload && (
            <Card className="h-fit space-y-4 p-5 xl:sticky xl:top-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold text-fg">{pilih.receiptNo}</h2>
                  <p className="text-xs text-muted">Dicetak {pilih.printedCount}×</p>
                </div>
                <div className="neu-in flex rounded-2xl p-1" role="group" aria-label="Lebar kertas">
                  {([32, 48] as const).map((w) => (
                    <button
                      key={w}
                      onClick={() => setLebar(w)}
                      aria-pressed={lebar === w}
                      className={clsx(
                        "min-h-11 rounded-xl px-4 text-sm font-semibold",
                        lebar === w ? "bg-grad-brand text-white" : "text-muted hover:text-fg",
                      )}
                    >
                      {w === 32 ? "58mm" : "80mm"}
                    </button>
                  ))}
                </div>
              </div>

              <pre className="struk mx-auto w-fit max-w-full overflow-x-auto rounded-xl p-4">
                {teksStruk(payload, lebar, { reprint: pilih.printedCount > 0 })}
              </pre>

              {jobTerakhir && (
                <div className="neu-in rounded-2xl p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted">Print job terakhir · {tanggalWaktu(jobTerakhir.createdAt)}</span>
                    <StatusPill status={jobTerakhir.status} />
                  </div>
                  {jobTerakhir.error && (
                    <p className="mt-2 text-rose-600">
                      Error (percobaan {jobTerakhir.attempts}): {jobTerakhir.error}
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center gap-4">
                <img
                  src={`/api/payments/qr?data=${encodeURIComponent(urlDigital)}`}
                  alt="QR struk digital"
                  width={112}
                  height={112}
                  className="rounded-xl bg-fg p-1"
                />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-fg">Struk digital</p>
                  <a href={payload.digitalUrl} target="_blank" rel="noreferrer" className="break-all text-brand-700 underline">
                    {urlDigital}
                  </a>
                  <p className="mt-1 text-xs text-muted">Berlaku 30 hari sejak terbit.</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => cetakDiBrowser(teksStruk(payload, lebar, { reprint: pilih.printedCount > 0 }), pilih.receiptNo)}
                >
                  <Printer size={16} aria-hidden /> Cetak / PDF (browser)
                </Button>
                <Button onClick={() => setKonfirmasi(true)}>
                  <Printer size={16} aria-hidden /> Cetak ulang (printer)
                </Button>
                <a
                  href={`/api/receipts/${pilih.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-base-800 px-4 text-sm font-semibold text-fg shadow-neu-sm hover:text-brand-700"
                >
                  <Download size={16} aria-hidden /> Unduh PDF
                </a>
              </div>
            </Card>
          )}
        </div>
      )}

      <Modal open={konfirmasi} onClose={() => setKonfirmasi(false)} title="Cetak ulang struk?">
        <p className="text-sm text-muted">
          Struk <b className="text-fg">{pilih?.receiptNo}</b> akan dicetak ulang dengan tanda{" "}
          <b className="text-fg">*** REPRINT ***</b>. Tindakan ini tercatat di audit log.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setKonfirmasi(false)}>
            Batal
          </Button>
          <Button disabled={sibuk} onClick={() => void cetakUlang()}>
            <Printer size={16} aria-hidden /> Ya, cetak ulang
          </Button>
        </div>
      </Modal>

      <Toast pesan={toast?.pesan ?? null} tone={toast?.tone} />
    </div>
  );
}
