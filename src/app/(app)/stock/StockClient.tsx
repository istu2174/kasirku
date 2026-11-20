"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { api } from "@/lib/client";
import { tanggalWaktu } from "@/lib/format";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Textarea, Toast } from "@/components/ui";

type Stok = {
  id: string;
  productId: string;
  name: string;
  emoji: string;
  sku: string;
  category: string;
  qty: number;
  minQty: number;
  trackStock: boolean;
  kritis: boolean;
  oversold: boolean;
};

type Mutasi = {
  id: string;
  type: string;
  qty: number;
  refType: string | null;
  refId: string | null;
  note: string | null;
  createdAt: string;
  product: { name: string; imageEmoji: string; sku: string };
  userName: string | null;
  orderNo: string | null;
};

type Tipe = "IN" | "OUT" | "ADJUSTMENT";

const LABEL_TIPE: Record<string, { label: string; tone: "green" | "red" | "amber" | "blue" | "neutral" }> = {
  IN: { label: "Masuk", tone: "green" },
  OUT: { label: "Keluar", tone: "red" },
  ADJUSTMENT: { label: "Penyesuaian", tone: "amber" },
  SALE: { label: "Penjualan", tone: "blue" },
  REFUND: { label: "Refund", tone: "neutral" },
};

export default function StockClient({ butuhApproval }: { butuhApproval: boolean }) {
  const [tab, setTab] = useState<"stok" | "mutasi">("stok");
  const [stok, setStok] = useState<Stok[]>([]);
  const [mutasi, setMutasi] = useState<Mutasi[]>([]);
  const [hanyaKritis, setHanyaKritis] = useState(false);
  const [cari, setCari] = useState("");
  const [memuat, setMemuat] = useState(true);
  const [toast, setToast] = useState<{ pesan: string; tone: "error" | "ok" } | null>(null);
  const [target, setTarget] = useState<Stok | null>(null);

  const kabari = useCallback((pesan: string, tone: "error" | "ok" = "ok") => {
    setToast({ pesan, tone });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const muat = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([
        api<{ stock: Stok[] }>(`/api/stock${hanyaKritis ? "?low=1" : ""}`),
        api<{ movements: Mutasi[] }>("/api/stock/movements?limit=100"),
      ]);
      setStok(s.stock);
      setMutasi(m.movements);
    } catch (e) {
      kabari(e instanceof Error ? e.message : "Gagal memuat stok", "error");
    } finally {
      setMemuat(false);
    }
  }, [hanyaKritis, kabari]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return q ? stok.filter((s) => s.name.toLowerCase().includes(q) || s.sku.toLowerCase().includes(q)) : stok;
  }, [stok, cari]);

  const jumlahKritis = stok.filter((s) => s.kritis).length;

  return (
    <div className="p-4 lg:p-8">
      <PageHeader title="Stok" subtitle="Stok per outlet, penyesuaian manual, dan riwayat mutasi" />

      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        <Button variant={tab === "stok" ? "primary" : "outline"} onClick={() => setTab("stok")} role="tab" aria-selected={tab === "stok"}>
          Stok saat ini
        </Button>
        <Button variant={tab === "mutasi" ? "primary" : "outline"} onClick={() => setTab("mutasi")} role="tab" aria-selected={tab === "mutasi"}>
          Riwayat mutasi
        </Button>
      </div>

      {tab === "stok" ? (
        <>
          <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
            <Input className="sm:max-w-xs" placeholder="Cari produk atau SKU…" value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari stok" />
            <label className="flex min-h-11 items-center gap-2 text-sm text-fg">
              <input type="checkbox" className="h-5 w-5 accent-brand-500" checked={hanyaKritis} onChange={(e) => setHanyaKritis(e.target.checked)} />
              Hanya stok kritis
            </label>
            {!hanyaKritis && jumlahKritis > 0 && <Badge tone="amber">{jumlahKritis} produk kritis</Badge>}
          </Card>

          {memuat ? (
            <Empty>Memuat stok…</Empty>
          ) : tampil.length === 0 ? (
            <Empty>{hanyaKritis ? "Tidak ada stok kritis." : "Belum ada produk yang melacak stok."}</Empty>
          ) : (
            <Card className="overflow-x-auto p-2">
              <table className="tabel">
                <thead>
                  <tr>
                    <th>Produk</th>
                    <th>SKU</th>
                    <th>Kategori</th>
                    <th className="text-right">Stok</th>
                    <th className="text-right">Minimum</th>
                    <th>Status</th>
                    <th className="text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {tampil.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <span className="mr-2" aria-hidden>
                          {s.emoji}
                        </span>
                        <span className="font-semibold text-fg">{s.name}</span>
                      </td>
                      <td className="font-mono text-xs">{s.sku}</td>
                      <td>{s.category}</td>
                      <td className={`uang text-right font-bold ${s.qty < 0 ? "text-rose-300" : "text-fg"}`}>{s.qty}</td>
                      <td className="uang text-right text-muted">{s.minQty}</td>
                      <td>
                        {s.oversold ? (
                          <Badge tone="red">Minus / oversold</Badge>
                        ) : s.kritis ? (
                          <Badge tone="amber">Kritis</Badge>
                        ) : (
                          <Badge tone="green">Aman</Badge>
                        )}
                      </td>
                      <td className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setTarget(s)}>
                          <SlidersHorizontal size={14} /> Sesuaikan
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      ) : mutasi.length === 0 ? (
        <Empty>Belum ada mutasi stok.</Empty>
      ) : (
        <Card className="overflow-x-auto p-2">
          <table className="tabel">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Produk</th>
                <th>Tipe</th>
                <th className="text-right">Qty</th>
                <th>Referensi</th>
                <th>User</th>
                <th>Catatan</th>
              </tr>
            </thead>
            <tbody>
              {mutasi.map((m) => {
                const t = LABEL_TIPE[m.type] ?? { label: m.type, tone: "neutral" as const };
                return (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap text-xs">{tanggalWaktu(m.createdAt)}</td>
                    <td>
                      <span className="mr-2" aria-hidden>
                        {m.product.imageEmoji}
                      </span>
                      {m.product.name}
                    </td>
                    <td>
                      <Badge tone={t.tone}>{t.label}</Badge>
                    </td>
                    <td className={`uang text-right font-bold ${m.qty < 0 ? "text-rose-300" : "text-emerald-300"}`}>
                      {m.qty > 0 ? `+${m.qty}` : m.qty}
                    </td>
                    <td className="font-mono text-xs">{m.orderNo ?? (m.refType === "ORDER" ? "Order" : (m.refType ?? "—"))}</td>
                    <td>{m.userName ?? <span className="text-muted">Sistem</span>}</td>
                    <td className="max-w-xs text-xs text-muted">{m.note ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <ModalPenyesuaian
        target={target}
        butuhApproval={butuhApproval}
        onClose={() => setTarget(null)}
        onSelesai={async () => {
          setTarget(null);
          kabari("Stok disesuaikan");
          await muat();
        }}
        kabari={kabari}
      />

      <Toast pesan={toast?.pesan ?? null} tone={toast?.tone} />
    </div>
  );
}

function ModalPenyesuaian({
  target,
  butuhApproval,
  onClose,
  onSelesai,
  kabari,
}: {
  target: Stok | null;
  butuhApproval: boolean;
  onClose: () => void;
  onSelesai: () => Promise<void>;
  kabari: (p: string, t?: "error" | "ok") => void;
}) {
  const [tipe, setTipe] = useState<Tipe>("IN");
  const [qty, setQty] = useState("");
  const [alasan, setAlasan] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    if (target) {
      setTipe("IN");
      setQty("");
      setAlasan("");
      setEmail("");
      setPin("");
    }
  }, [target]);

  const n = Number(qty);
  const valid = qty.trim() !== "" && Number.isInteger(n) && n !== 0 && (tipe === "ADJUSTMENT" || n > 0);
  const delta = valid ? (tipe === "OUT" ? -n : n) : 0;

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    if (!target || !valid) return;
    setSibuk(true);
    try {
      await api("/api/stock", {
        method: "POST",
        body: JSON.stringify({
          productId: target.productId,
          type: tipe,
          qty: n,
          reason: alasan.trim(),
          ...(butuhApproval ? { approver: { email: email.trim(), pin } } : {}),
        }),
      });
      await onSelesai();
    } catch (err) {
      kabari(err instanceof Error ? err.message : "Gagal menyesuaikan stok", "error");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <Modal open={target !== null} onClose={onClose} title={target ? `Sesuaikan stok · ${target.name}` : ""}>
      {target && (
        <form onSubmit={kirim} className="space-y-4">
          <p className="text-sm text-muted">
            Stok sekarang <span className="uang font-bold text-fg">{target.qty}</span>
            {valid && (
              <>
                {" "}
                → <span className={`uang font-bold ${target.qty + delta < 0 ? "text-rose-300" : "text-grad"}`}>{target.qty + delta}</span>
              </>
            )}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipe">
              <Select value={tipe} onChange={(e) => setTipe(e.target.value as Tipe)}>
                <option value="IN">Masuk (IN)</option>
                <option value="OUT">Keluar (OUT)</option>
                <option value="ADJUSTMENT">Penyesuaian / opname (±)</option>
              </Select>
            </Field>
            <Field label="Qty" hint={tipe === "ADJUSTMENT" ? "Selisih: positif tambah, negatif kurang" : "Angka positif"}>
              <Input type="number" step={1} min={tipe === "ADJUSTMENT" ? undefined : 1} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} required />
            </Field>
          </div>
          <Field label="Alasan (wajib)">
            <Textarea rows={2} value={alasan} onChange={(e) => setAlasan(e.target.value)} required minLength={3} placeholder="mis. Terima barang dari supplier, barang rusak, hasil opname" />
          </Field>
          {butuhApproval && (
            <div className="neu-in space-y-3 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Persetujuan Manager</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Email Manager">
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
                </Field>
                <Field label="PIN Manager">
                  <Input type="password" inputMode="numeric" pattern="\d{4,6}" value={pin} onChange={(e) => setPin(e.target.value)} required autoComplete="off" />
                </Field>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={sibuk || !valid || alasan.trim().length < 3}>
              {sibuk ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
