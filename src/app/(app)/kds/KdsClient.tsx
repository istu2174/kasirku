"use client";

import { clsx } from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, Clock } from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, Empty, PageHeader, Toast } from "@/components/ui";

type StatusDapur = "NEW" | "IN_PROGRESS" | "READY" | "SERVED";

type Item = {
  id: string;
  nameSnapshot: string;
  qty: number;
  note: string | null;
  kitchenStatus: StatusDapur;
  modifiers: { id: string; nameSnapshot: string }[];
};

type Tiket = {
  id: string;
  orderNo: string;
  type: string;
  note: string | null;
  createdAt: string;
  table: { name: string } | null;
  items: Item[];
};

const URUTAN: StatusDapur[] = ["NEW", "IN_PROGRESS", "READY", "SERVED"];
const BERIKUT: Record<Exclude<StatusDapur, "SERVED">, { status: StatusDapur; label: string }> = {
  NEW: { status: "IN_PROGRESS", label: "Proses" },
  IN_PROGRESS: { status: "READY", label: "Siap" },
  READY: { status: "SERVED", label: "Antar" },
};
const KOLOM: { status: Exclude<StatusDapur, "SERVED">; judul: string }[] = [
  { status: "NEW", judul: "Baru" },
  { status: "IN_PROGRESS", judul: "Diproses" },
  { status: "READY", judul: "Siap" },
];
const TIPE: Record<string, string> = { DINE_IN: "Makan di tempat", TAKEAWAY: "Bawa pulang", DELIVERY: "Delivery", WALK_IN: "Walk-in" };

/** Status tiket = status item paling belakang di dapur (yang paling lambat). */
function statusTiket(t: Tiket): Exclude<StatusDapur, "SERVED"> {
  const min = Math.min(...t.items.map((i) => URUTAN.indexOf(i.kitchenStatus)));
  return URUTAN[Math.min(min, 2)] as Exclude<StatusDapur, "SERVED">;
}

function bunyi(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);
  gain.gain.setValueAtTime(0.25, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.35);
}

export default function KdsClient() {
  const [tiket, setTiket] = useState<Tiket[] | null>(null);
  const [sekarang, setSekarang] = useState(() => Date.now());
  const [sibuk, setSibuk] = useState<Set<string>>(new Set());
  const [suara, setSuara] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dikenal = useRef<Set<string> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const suaraRef = useRef(suara);
  suaraRef.current = suara;

  const muat = useCallback(async () => {
    try {
      const d = await api<{ orders: Tiket[] }>("/api/kds");
      const ids = new Set(d.orders.map((o) => o.id));
      const adaBaru = dikenal.current !== null && d.orders.some((o) => !dikenal.current?.has(o.id));
      dikenal.current = ids;
      if (adaBaru && suaraRef.current && audio.current) {
        if (audio.current.state === "suspended") await audio.current.resume();
        bunyi(audio.current);
      }
      setTiket(d.orders);
      setSekarang(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat tiket");
    }
  }, []);

  useEffect(() => {
    void muat();
    const t = setInterval(() => void muat(), 5000);
    return () => clearInterval(t);
  }, [muat]);

  // Browser hanya mengizinkan audio setelah interaksi pengguna: siapkan AudioContext di klik pertama.
  useEffect(() => {
    const buka = () => {
      audio.current ??= new AudioContext();
      if (audio.current.state === "suspended") void audio.current.resume();
    };
    window.addEventListener("pointerdown", buka);
    return () => window.removeEventListener("pointerdown", buka);
  }, []);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3500);
    return () => clearTimeout(t);
  }, [error]);

  async function majukan(items: Item[]) {
    const target = items.filter((i) => i.kitchenStatus !== "SERVED");
    if (target.length === 0) return;
    setSibuk((s) => new Set([...s, ...target.map((i) => i.id)]));
    try {
      await Promise.all(
        target.map((i) =>
          api(`/api/kds/items/${i.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: BERIKUT[i.kitchenStatus as Exclude<StatusDapur, "SERVED">].status }),
          }),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengubah status");
    } finally {
      await muat();
      setSibuk((s) => {
        const n = new Set(s);
        target.forEach((i) => n.delete(i.id));
        return n;
      });
    }
  }

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Dapur"
        subtitle="Kitchen Display — diperbarui otomatis tiap 5 detik"
        actions={
          <Button variant="outline" onClick={() => setSuara((v) => !v)} aria-pressed={suara}>
            {suara ? <Bell size={16} /> : <BellOff size={16} />} {suara ? "Bunyi aktif" : "Bunyi mati"}
          </Button>
        }
      />

      {tiket === null ? (
        <Empty>Memuat tiket…</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {KOLOM.map((k) => {
            const daftar = tiket.filter((t) => statusTiket(t) === k.status);
            return (
              <section key={k.status} className="neu-in flex min-h-[50vh] flex-col gap-4 p-3">
                <h2 className="flex items-center justify-between px-1 text-sm font-bold uppercase tracking-wide text-muted">
                  {k.judul} <Badge tone={k.status === "READY" ? "green" : k.status === "NEW" ? "amber" : "blue"}>{daftar.length}</Badge>
                </h2>
                {daftar.length === 0 && <p className="px-1 py-6 text-center text-xs text-muted">Tidak ada tiket</p>}
                {daftar.map((t) => {
                  const umur = Math.max(0, Math.floor((sekarang - new Date(t.createdAt).getTime()) / 60_000));
                  const terlambat = umur > 15;
                  const tahap = statusTiket(t);
                  const itemTahap = t.items.filter((i) => i.kitchenStatus === tahap);
                  return (
                    <article key={t.id} className={clsx("neu flex flex-col gap-3 p-4", terlambat && "ring-2 ring-rose-500/60")}>
                      <header className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-grad text-lg font-extrabold">{t.table ? `Meja ${t.table.name}` : TIPE[t.type] ?? t.type}</p>
                          <p className="font-mono text-xs text-muted">{t.orderNo}</p>
                        </div>
                        <span
                          className={clsx(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1",
                            terlambat ? "bg-rose-500/15 text-rose-300 ring-rose-400/40" : "bg-white/5 text-muted ring-white/10",
                          )}
                        >
                          <Clock size={12} /> {umur} mnt
                        </span>
                      </header>
                      {t.note && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-300">Catatan: {t.note}</p>}

                      <ul className="space-y-2">
                        {t.items.map((i) => {
                          const lanjut = i.kitchenStatus === "SERVED" ? null : BERIKUT[i.kitchenStatus];
                          return (
                            <li key={i.id} className="flex items-center justify-between gap-2 border-t border-line pt-2">
                              <div className="min-w-0">
                                <p className={clsx("font-semibold", i.kitchenStatus === "READY" ? "text-emerald-300" : "text-fg")}>
                                  {i.qty}× {i.nameSnapshot}
                                </p>
                                {i.modifiers.length > 0 && (
                                  <p className="text-xs text-muted">+ {i.modifiers.map((m) => m.nameSnapshot).join(", ")}</p>
                                )}
                                {i.note && <p className="text-xs italic text-amber-300">“{i.note}”</p>}
                              </div>
                              {lanjut && (
                                <Button
                                  variant="outline"
                                  className="shrink-0"
                                  disabled={sibuk.has(i.id)}
                                  onClick={() => void majukan([i])}
                                >
                                  {lanjut.label}
                                </Button>
                              )}
                            </li>
                          );
                        })}
                      </ul>

                      <Button
                        size="lg"
                        variant={tahap === "READY" ? "success" : "primary"}
                        disabled={itemTahap.some((i) => sibuk.has(i.id))}
                        onClick={() => void majukan(itemTahap)}
                      >
                        {tahap === "NEW" ? "Proses semua" : tahap === "IN_PROGRESS" ? "Semua siap" : "Antar semua"}
                      </Button>
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}

      <Toast pesan={error} />
    </div>
  );
}
