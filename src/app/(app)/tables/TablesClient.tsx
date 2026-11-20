"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Users } from "lucide-react";
import { api, rupiah } from "@/lib/client";
import { Badge, Button, Empty, PageHeader, StatusPill, Toast } from "@/components/ui";

type StatusMeja = "KOSONG" | "TERISI" | "RESERVASI" | "PERLU_DIBERSIHKAN";

type Meja = {
  id: string;
  name: string;
  capacity: number;
  area: string;
  status: StatusMeja;
  orders: { id: string; orderNo: string; grandTotal: number; status: string; createdAt: string }[];
};

const INFO: Record<StatusMeja, { label: string; tone: "green" | "red" | "blue" | "amber"; ring: string }> = {
  KOSONG: { label: "Kosong", tone: "green", ring: "ring-emerald-400/40" },
  TERISI: { label: "Terisi", tone: "red", ring: "ring-rose-400/50" },
  RESERVASI: { label: "Reservasi", tone: "blue", ring: "ring-brand-400/50" },
  PERLU_DIBERSIHKAN: { label: "Perlu dibersihkan", tone: "amber", ring: "ring-amber-400/50" },
};

const kelasLinkUtama =
  "inline-flex min-h-11 items-center justify-center rounded-2xl bg-grad-brand px-4 text-sm font-semibold text-white shadow-glow hover:brightness-110";

export default function TablesClient() {
  const [meja, setMeja] = useState<Meja[] | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const muat = useCallback(async () => {
    try {
      const d = await api<{ tables: Meja[] }>("/api/tables");
      setMeja(d.tables);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat meja");
    }
  }, []);

  useEffect(() => {
    void muat();
    const t = setInterval(() => void muat(), 15_000);
    return () => clearInterval(t);
  }, [muat]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3500);
    return () => clearTimeout(t);
  }, [error]);

  async function ubahStatus(id: string, status: StatusMeja) {
    setSibuk(id);
    try {
      await api(`/api/tables/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengubah status");
    } finally {
      setSibuk(null);
    }
  }

  const perArea = useMemo(() => {
    const m = new Map<string, Meja[]>();
    for (const t of meja ?? []) m.set(t.area, [...(m.get(t.area) ?? []), t]);
    return [...m.entries()];
  }, [meja]);

  const hitung = (s: StatusMeja) => (meja ?? []).filter((t) => t.status === s).length;

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Meja"
        subtitle="Denah meja & order aktif"
        actions={
          <Button variant="outline" onClick={() => void muat()}>
            <RefreshCw size={16} /> Muat ulang
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {(Object.keys(INFO) as StatusMeja[]).map((s) => (
          <Badge key={s} tone={INFO[s].tone}>
            {INFO[s].label}: {hitung(s)}
          </Badge>
        ))}
      </div>

      {meja === null ? (
        <Empty>Memuat meja…</Empty>
      ) : meja.length === 0 ? (
        <Empty>Belum ada meja di outlet ini.</Empty>
      ) : (
        <div className="space-y-8">
          {perArea.map(([area, daftar]) => (
            <section key={area}>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{area}</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {daftar.map((t) => {
                  const info = INFO[t.status] ?? INFO.KOSONG;
                  const order = t.orders[0];
                  const proses = sibuk === t.id;
                  return (
                    <div key={t.id} className={clsx("neu flex flex-col gap-3 p-4 ring-2", info.ring)}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-grad text-xl font-extrabold">{t.name}</p>
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                            <Users size={12} /> {t.capacity} kursi
                          </p>
                        </div>
                        <Badge tone={info.tone}>{info.label}</Badge>
                      </div>

                      {order ? (
                        <div className="neu-in space-y-1 px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs text-muted">{order.orderNo}</span>
                            <StatusPill status={order.status} />
                          </div>
                          <p className="uang font-bold text-fg">{rupiah(order.grandTotal)}</p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted">Tidak ada order aktif</p>
                      )}

                      <div className="mt-auto flex flex-col gap-2">
                        {order ? (
                          <Link href={`/pos?order=${order.id}`} className={kelasLinkUtama}>
                            Buka Bill
                          </Link>
                        ) : (
                          (t.status === "KOSONG" || t.status === "RESERVASI") && (
                            <Link href={`/pos?table=${t.id}`} className={kelasLinkUtama}>
                              Buat Order
                            </Link>
                          )
                        )}
                        {t.status === "PERLU_DIBERSIHKAN" && (
                          <Button variant="success" disabled={proses} onClick={() => void ubahStatus(t.id, "KOSONG")}>
                            Tandai bersih
                          </Button>
                        )}
                        {t.status === "KOSONG" && (
                          <Button variant="outline" disabled={proses} onClick={() => void ubahStatus(t.id, "RESERVASI")}>
                            Reservasi
                          </Button>
                        )}
                        {t.status === "RESERVASI" && (
                          <Button variant="outline" disabled={proses} onClick={() => void ubahStatus(t.id, "KOSONG")}>
                            Batalkan reservasi
                          </Button>
                        )}
                        {t.status === "TERISI" && !order && (
                          <Button
                            variant="outline"
                            disabled={proses}
                            onClick={() => void ubahStatus(t.id, "PERLU_DIBERSIHKAN")}
                          >
                            Tamu selesai
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <Toast pesan={error} />
    </div>
  );
}
