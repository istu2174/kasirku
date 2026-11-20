"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { api } from "@/lib/client";
import { tanggalWaktu } from "@/lib/format";
import { Badge, Button, Card, Empty, Field, PageHeader, Select, Toast } from "@/components/ui";

type Log = {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  before: string | null;
  after: string | null;
  ip: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
};
type Respon = { logs: Log[]; nextCursor: string | null; aksi: string[] };

const AKSI_DASAR = [
  "ORDER_CANCEL",
  "PAYMENT_REFUND",
  "RECEIPT_REPRINT",
  "SHIFT_OPEN",
  "SHIFT_CLOSE",
  "PRODUCT_*",
  "PRICE_*",
  "STOCK_ADJUST",
  "USER_*",
  "SETTINGS_UPDATE",
];

const tone = (a: string): "red" | "amber" | "blue" | "neutral" =>
  /CANCEL|REFUND|DELETE/.test(a) ? "red" : /PRICE|REPRINT|ADJUST/.test(a) ? "amber" : /SHIFT/.test(a) ? "blue" : "neutral";

function parse(s: string | null): Record<string, unknown> | null {
  if (!s) return null;
  try {
    const v: unknown = JSON.parse(s);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : { nilai: v };
  } catch {
    return { nilai: s };
  }
}

const teks = (v: unknown) => (v === undefined ? "–" : typeof v === "string" ? v : JSON.stringify(v));

/** Ringkasan satu baris: field yang berubah "key: lama → baru". */
function ringkas(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  const s = keys
    .filter((k) => teks(before?.[k]) !== teks(after?.[k]))
    .map((k) => (before && k in before ? `${k}: ${teks(before[k])} → ${teks(after?.[k])}` : `${k}: ${teks(after?.[k])}`))
    .join(" · ");
  return s.length > 140 ? `${s.slice(0, 140)}…` : s || "–";
}

export default function AuditClient() {
  const [aksi, setAksi] = useState("");
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [daftarAksi, setDaftarAksi] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [buka, setBuka] = useState<Set<string>>(new Set());
  const [memuat, setMemuat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const muat = useCallback(
    async (lanjut: string | null) => {
      setMemuat(true);
      try {
        const q = new URLSearchParams({ limit: "100" });
        if (aksi) q.set("action", aksi);
        if (lanjut) q.set("cursor", lanjut);
        const r = await api<Respon>(`/api/audit?${q}`);
        setLogs((lama) => (lanjut && lama ? [...lama, ...r.logs] : r.logs));
        setCursor(r.nextCursor);
        setDaftarAksi(r.aksi);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memuat audit log");
      } finally {
        setMemuat(false);
      }
    },
    [aksi],
  );

  useEffect(() => {
    void muat(null);
  }, [muat]);

  const opsi = [...new Set([...AKSI_DASAR, ...daftarAksi])].filter(
    (a) => !AKSI_DASAR.some((d) => d.endsWith("*") && a !== d && a.startsWith(d.slice(0, -1))),
  );

  const toggle = (id: string) =>
    setBuka((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="p-4 lg:p-8">
      <PageHeader title="Audit Log" subtitle="Jejak aksi sensitif. Read-only: tidak bisa diubah atau dihapus." />

      <Card className="mb-6 p-5">
        <div className="w-full sm:w-72">
          <Field label="Filter aksi">
            <Select value={aksi} onChange={(e) => setAksi(e.target.value)}>
              <option value="">Semua aksi</option>
              {opsi.map((a) => (
                <option key={a} value={a}>
                  {a.endsWith("*") ? `${a.slice(0, -1)}… (semua)` : a}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        {!logs ? (
          <Empty>{error ?? "Memuat..."}</Empty>
        ) : logs.length === 0 ? (
          <Empty>Belum ada catatan untuk filter ini.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabel">
              <thead>
                <tr>
                  <th className="w-10">
                    <span className="sr-only">Detail</span>
                  </th>
                  <th>Waktu</th>
                  <th>User</th>
                  <th>Aksi</th>
                  <th>Entitas</th>
                  <th>Perubahan</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => {
                  const before = parse(l.before);
                  const after = parse(l.after);
                  const terbuka = buka.has(l.id);
                  return (
                    <Fragment key={l.id}>
                      <tr className="cursor-pointer" onClick={() => toggle(l.id)}>
                        <td>
                          <button
                            type="button"
                            aria-expanded={terbuka}
                            aria-label={terbuka ? "Tutup detail" : "Lihat detail"}
                            className="grid h-11 w-11 place-items-center rounded-2xl text-muted hover:text-fg"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggle(l.id);
                            }}
                          >
                            {terbuka ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                        <td className="whitespace-nowrap text-muted">{tanggalWaktu(l.createdAt)}</td>
                        <td className="whitespace-nowrap text-fg">{l.user?.name ?? "Sistem"}</td>
                        <td>
                          <Badge tone={tone(l.action)}>{l.action}</Badge>
                        </td>
                        <td className="whitespace-nowrap">
                          <span className="text-fg">{l.entity}</span>{" "}
                          <span className="text-xs text-muted">{l.entityId.slice(-8)}</span>
                        </td>
                        <td className="min-w-[16rem] text-muted">{ringkas(before, after)}</td>
                      </tr>
                      {terbuka && (
                        <tr>
                          <td colSpan={6}>
                            <div className="grid gap-3 md:grid-cols-2">
                              {[
                                { judul: "Sebelum", isi: before },
                                { judul: "Sesudah", isi: after },
                              ].map((b) => (
                                <div key={b.judul}>
                                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{b.judul}</p>
                                  <pre className="neu-in overflow-x-auto whitespace-pre-wrap break-all p-3 text-xs text-fg">
                                    {b.isi ? JSON.stringify(b.isi, null, 2) : "–"}
                                  </pre>
                                </div>
                              ))}
                            </div>
                            <p className="mt-2 text-xs text-muted">
                              ID entitas: {l.entityId}
                              {l.user && ` · ${l.user.email}`}
                              {l.ip && ` · IP ${l.ip}`}
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {cursor && (
          <div className="mt-4 text-center">
            <Button variant="outline" disabled={memuat} onClick={() => void muat(cursor)}>
              {memuat ? "Memuat..." : "Muat lebih banyak"}
            </Button>
          </div>
        )}
      </Card>
      <Toast pesan={logs ? error : null} />
    </div>
  );
}
