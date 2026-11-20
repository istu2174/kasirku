"use client";

import { useState } from "react";
import { Printer, Save } from "lucide-react";
import { api, rupiah } from "@/lib/client";
import { hitungTotal, type RoundingMode, type TaxConfig } from "@/lib/money";
import { teksStruk } from "@/lib/struk";
import { contohStruk } from "@/app/api/settings/contoh-struk";
import { Badge, Button, Card, Field, Input, PageHeader, Select, Textarea, Toast } from "@/components/ui";

export type ReceiptConfig = {
  header: string;
  footer: string;
  paperWidth: 58 | 80;
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
};

type Awal = {
  name: string;
  address: string;
  phone: string;
  code: string;
  taxConfig: TaxConfig;
  receiptConfig: ReceiptConfig;
};

const PEMBULATAN = [0, 100, 500, 1000] as const;

export default function SettingsClient({ awal, printer }: { awal: Awal; printer: { mode: string; agentUrl: string } }) {
  const [profil, setProfil] = useState({ name: awal.name, address: awal.address, phone: awal.phone });
  const [pajak, setPajak] = useState({
    taxName: awal.taxConfig.taxName ?? "PB1",
    taxPercent: String(awal.taxConfig.taxPercent),
    taxInclusive: awal.taxConfig.taxInclusive,
    servicePercent: String(awal.taxConfig.servicePercent),
    roundingTo: (PEMBULATAN as readonly number[]).includes(awal.taxConfig.roundingTo) ? awal.taxConfig.roundingTo : 0,
    roundingMode: awal.taxConfig.roundingMode ?? "NEAREST",
  });
  const [struk, setStruk] = useState<ReceiptConfig>(awal.receiptConfig);
  const [sibuk, setSibuk] = useState(false);
  const [mencetak, setMencetak] = useState(false);
  const [toast, setToast] = useState<{ pesan: string; tone: "error" | "ok" } | null>(null);

  const kabari = (pesan: string, tone: "error" | "ok" = "ok") => {
    setToast({ pesan, tone });
    setTimeout(() => setToast(null), 3000);
  };

  const persen = (s: string) => {
    const n = Number(s);
    return s.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  };
  const taxPercent = persen(pajak.taxPercent);
  const servicePercent = persen(pajak.servicePercent);

  const config: TaxConfig | null =
    taxPercent === null || servicePercent === null
      ? null
      : {
          taxName: pajak.taxName,
          taxPercent,
          taxInclusive: pajak.taxInclusive,
          servicePercent,
          roundingTo: pajak.roundingTo,
          roundingMode: pajak.roundingMode,
        };

  const contoh = config ? hitungTotal({ lines: [{ unitPrice: 100000, qty: 1 }], config }) : null;
  const preview = config
    ? teksStruk({ ...contohStruk({ ...profil, code: awal.code }, config, struk.footer), header: struk.header }, struk.paperWidth === 80 ? 48 : 32)
    : "";

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return kabari("Persen pajak/service harus 0–100", "error");
    setSibuk(true);
    try {
      await api("/api/settings/outlet", {
        method: "PATCH",
        body: JSON.stringify({
          name: profil.name.trim(),
          address: profil.address.trim(),
          phone: profil.phone.trim(),
          taxConfig: config,
          receiptConfig: struk,
        }),
      });
      kabari("Pengaturan disimpan");
    } catch (err) {
      kabari(err instanceof Error ? err.message : "Gagal menyimpan", "error");
    } finally {
      setSibuk(false);
    }
  }

  async function tesCetak() {
    setMencetak(true);
    try {
      const r = await api<{ pesan: string }>("/api/settings/print-test", { method: "POST" });
      kabari(r.pesan);
    } catch (err) {
      kabari(err instanceof Error ? err.message : "Tes cetak gagal", "error");
    } finally {
      setMencetak(false);
    }
  }

  return (
    <form onSubmit={simpan} className="p-4 lg:p-8">
      <PageHeader
        title="Pengaturan"
        subtitle="Profil outlet, pajak & service, template struk, dan printer"
        actions={
          <Button type="submit" disabled={sibuk || !config}>
            <Save size={16} /> {sibuk ? "Menyimpan…" : "Simpan pengaturan"}
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="space-y-4 p-5">
          <h2 className="text-base font-bold text-fg">Profil outlet</h2>
          <Field label="Nama outlet">
            <Input value={profil.name} onChange={(e) => setProfil({ ...profil, name: e.target.value })} required minLength={2} />
          </Field>
          <Field label="Alamat">
            <Textarea rows={2} value={profil.address} onChange={(e) => setProfil({ ...profil, address: e.target.value })} required minLength={5} />
          </Field>
          <Field label="Telepon">
            <Input type="tel" value={profil.phone} onChange={(e) => setProfil({ ...profil, phone: e.target.value })} required minLength={5} />
          </Field>
          <p className="text-xs text-muted">
            Kode outlet: <span className="font-mono text-brand-700">{awal.code}</span> (dipakai di nomor struk, tidak bisa diubah)
          </p>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="text-base font-bold text-fg">Pajak & service</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Jenis pajak">
              <Select value={pajak.taxName} onChange={(e) => setPajak({ ...pajak, taxName: e.target.value })}>
                <option value="PB1">PB1</option>
                <option value="PPN">PPN</option>
              </Select>
            </Field>
            <Field label="Pajak (%)">
              <Input type="number" min={0} max={100} step="0.01" value={pajak.taxPercent} onChange={(e) => setPajak({ ...pajak, taxPercent: e.target.value })} required />
            </Field>
            <Field label="Service (%)">
              <Input type="number" min={0} max={100} step="0.01" value={pajak.servicePercent} onChange={(e) => setPajak({ ...pajak, servicePercent: e.target.value })} required />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Harga">
              <Select value={pajak.taxInclusive ? "1" : "0"} onChange={(e) => setPajak({ ...pajak, taxInclusive: e.target.value === "1" })}>
                <option value="0">Belum termasuk pajak</option>
                <option value="1">Sudah termasuk pajak</option>
              </Select>
            </Field>
            <Field label="Pembulatan">
              <Select value={pajak.roundingTo} onChange={(e) => setPajak({ ...pajak, roundingTo: Number(e.target.value) })}>
                {PEMBULATAN.map((r) => (
                  <option key={r} value={r}>
                    {r === 0 ? "Tanpa pembulatan" : `Kelipatan ${rupiah(r)}`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Arah pembulatan">
              <Select value={pajak.roundingMode} onChange={(e) => setPajak({ ...pajak, roundingMode: e.target.value as RoundingMode })} disabled={pajak.roundingTo === 0}>
                <option value="NEAREST">Terdekat</option>
                <option value="UP">Ke atas</option>
                <option value="DOWN">Ke bawah</option>
              </Select>
            </Field>
          </div>

          <div className="neu-in p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Contoh transaksi Rp100.000</p>
            {contoh ? (
              <dl className="space-y-1 text-sm">
                {(
                  [
                    ["Subtotal", contoh.subtotal],
                    [`Service ${servicePercent}%`, contoh.service],
                    [`${pajak.taxName} ${taxPercent}%${pajak.taxInclusive ? " (termasuk)" : ""}`, contoh.tax],
                    ["Pembulatan", contoh.rounding],
                  ] as const
                ).map(([label, nilai]) => (
                  <div key={label} className="flex justify-between">
                    <dt className="text-muted">{label}</dt>
                    <dd className="uang text-fg">{rupiah(nilai)}</dd>
                  </div>
                ))}
                <div className="flex justify-between border-t border-line pt-2 font-bold">
                  <dt className="text-fg">Total</dt>
                  <dd className="uang text-grad text-lg">{rupiah(contoh.grandTotal)}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-rose-600">Persen pajak/service harus 0–100.</p>
            )}
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="text-base font-bold text-fg">Template struk</h2>
          <Field label="Header" hint="Dicetak di bawah alamat outlet (mis. NPWP, jam buka)">
            <Textarea rows={2} value={struk.header} onChange={(e) => setStruk({ ...struk, header: e.target.value })} maxLength={500} />
          </Field>
          <Field label="Footer" hint="Boleh beberapa baris">
            <Textarea rows={3} value={struk.footer} onChange={(e) => setStruk({ ...struk, footer: e.target.value })} maxLength={500} />
          </Field>
          <Field label="Lebar kertas">
            <Select value={struk.paperWidth} onChange={(e) => setStruk({ ...struk, paperWidth: Number(e.target.value) === 80 ? 80 : 58 })}>
              <option value={58}>58 mm (32 karakter)</option>
              <option value={80}>80 mm (48 karakter)</option>
            </Select>
          </Field>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="text-base font-bold text-fg">Rekening transfer bank</h2>
          <p className="text-xs text-muted">Ditampilkan ke pelanggan saat kasir memilih &quot;Transfer Bank&quot; di layar bayar.</p>
          <Field label="Nama bank">
            <Input value={struk.bankName} maxLength={40} placeholder="BCA" onChange={(e) => setStruk({ ...struk, bankName: e.target.value })} />
          </Field>
          <Field label="Nomor rekening">
            <Input
              value={struk.bankAccountNo}
              maxLength={30}
              inputMode="numeric"
              placeholder="1234567890"
              onChange={(e) => setStruk({ ...struk, bankAccountNo: e.target.value.replace(/[^0-9 -]/g, "") })}
            />
          </Field>
          <Field label="Atas nama">
            <Input value={struk.bankAccountName} maxLength={60} onChange={(e) => setStruk({ ...struk, bankAccountName: e.target.value })} />
          </Field>
        </Card>

        <Card className="space-y-3 p-5">
          <h2 className="text-base font-bold text-fg">Preview struk</h2>
          <div className="overflow-x-auto">
            <pre className="struk">{preview}</pre>
          </div>
        </Card>

        <Card className="space-y-4 p-5 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-fg">Printer</h2>
            <Button type="button" variant="outline" onClick={tesCetak} disabled={mencetak}>
              <Printer size={16} /> {mencetak ? "Mengirim…" : "Tes Cetak"}
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="PRINT_MODE" hint="Diatur lewat environment server">
              <div className="flex min-h-11 items-center gap-2">
                <Badge tone={printer.mode === "agent" ? "green" : "amber"}>{printer.mode}</Badge>
                <span className="text-xs text-muted">{printer.mode === "agent" ? "Kirim ke print agent lokal" : "Simulasi, tanpa printer fisik"}</span>
              </div>
            </Field>
            <Field label="PRINT_AGENT_URL" hint="Diatur lewat environment server">
              <Input value={printer.agentUrl} readOnly className="font-mono" />
            </Field>
          </div>
          <p className="text-xs text-muted">Tes Cetak memakai pengaturan yang sudah tersimpan; simpan dulu kalau baru mengubah template.</p>
        </Card>
      </div>

      <Toast pesan={toast?.pesan ?? null} tone={toast?.tone} />
    </form>
  );
}
