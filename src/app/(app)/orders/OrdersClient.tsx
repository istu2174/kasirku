"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { clsx } from "clsx";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { api, rupiah } from "@/lib/client";
import { tanggalWaktu } from "@/lib/format";
import { can, type Role } from "@/lib/rbac";
import { teksStruk, type ReceiptPayload } from "@/lib/struk";
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  PageHeader,
  StatusPill,
  Textarea,
  Toast,
} from "@/components/ui";

type Pembayaran = {
  id: string;
  method: string;
  amount: number;
  status: string;
  amountReceived: number | null;
  change: number | null;
  proofUrl: string | null;
  createdAt: string;
  paidAt: string | null;
  refundedAmount: number;
};

type StrukRow = { id: string; receiptNo: string; kind: string; issuedAt: string; payloadJson: string };

type OrderRow = {
  id: string;
  orderNo: string;
  type: string;
  status: string;
  grandTotal: number;
  needsReview: boolean;
  createdAt: string;
  table: { name: string } | null;
  cashier: { name: string };
  payments: Pembayaran[];
};

type OrderDetail = OrderRow & {
  subtotal: number;
  discount: number;
  service: number;
  tax: number;
  rounding: number;
  note: string | null;
  oversold: boolean;
  paidAt: string | null;
  guestCount: number | null;
  items: {
    id: string;
    nameSnapshot: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
    note: string | null;
    modifiers: { id: string; nameSnapshot: string; priceDelta: number }[];
  }[];
  receipts: StrukRow[];
};

const FILTER = [
  { value: "ALL", label: "Semua" },
  { value: "DRAFT", label: "Draft" },
  { value: "CONFIRMED", label: "Diproses" },
  { value: "PAID", label: "Lunas" },
  { value: "REFUNDED,PARTIALLY_REFUNDED", label: "Refund" },
  { value: "CANCELLED", label: "Batal" },
  { value: "NEEDS_REVIEW", label: "Perlu review" },
];

const TIPE: Record<string, string> = {
  DINE_IN: "Makan di tempat",
  TAKEAWAY: "Bawa pulang",
  DELIVERY: "Delivery",
  WALK_IN: "Walk-in",
};

const METODE: Record<string, string> = {
  CASH: "Tunai",
  QRIS: "QRIS",
  VA: "Virtual Account",
  MANUAL_TRANSFER: "Transfer manual",
  EWALLET: "E-wallet",
};

const strukTeks = (s: StrukRow) => teksStruk(JSON.parse(s.payloadJson) as ReceiptPayload, 32);
const belumBayar = (status: string) => status === "DRAFT" || status === "CONFIRMED";
const gambarBukti = (url: string) => url.startsWith("data:image/") || /^https?:\/\//.test(url) || url.startsWith("/");

export default function OrdersClient({ role }: { role: Role }) {
  const bolehApprove = can(role, "order.void");
  const [filter, setFilter] = useState("ALL");
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [pilihId, setPilihId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ pesan: string; tone: "error" | "ok" } | null>(null);

  const kabar = useCallback((pesan: string, tone: "error" | "ok" = "error") => {
    setToast({ pesan, tone });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const muat = useCallback(async () => {
    try {
      const d = await api<{ orders: OrderRow[] }>(`/api/orders?status=${encodeURIComponent(filter)}&limit=100`);
      setOrders(d.orders);
    } catch (e) {
      kabar((e as Error).message);
    }
  }, [filter, kabar]);

  useEffect(() => {
    setOrders(null);
    void muat();
  }, [muat]);

  const tutupDetail = useCallback(() => setPilihId(null), []);

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Pesanan"
        subtitle="Daftar order, pembatalan, refund, dan verifikasi transfer manual."
        actions={
          <Button variant="outline" onClick={() => void muat()}>
            <RefreshCw size={16} aria-hidden /> Muat ulang
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Filter status">
        {FILTER.map((f) => (
          <button
            key={f.value}
            role="tab"
            aria-selected={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={clsx(
              "min-h-11 rounded-2xl px-4 text-sm font-semibold transition",
              filter === f.value ? "bg-grad-brand text-white shadow-glow" : "text-muted shadow-neu-sm hover:text-fg",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {orders === null ? (
        <Empty>Memuat pesanan…</Empty>
      ) : orders.length === 0 ? (
        <Empty>Belum ada pesanan dengan status ini.</Empty>
      ) : (
        <Card className="overflow-x-auto p-2">
          <table className="tabel">
            <thead>
              <tr>
                <th>No. order</th>
                <th>Waktu</th>
                <th>Tipe / meja</th>
                <th>Kasir</th>
                <th className="text-right">Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="cursor-pointer" onClick={() => setPilihId(o.id)}>
                  <td>
                    <button className="min-h-11 text-left font-semibold text-fg hover:text-brand-700">{o.orderNo}</button>
                  </td>
                  <td className="text-muted">{tanggalWaktu(o.createdAt)}</td>
                  <td>
                    {TIPE[o.type] ?? o.type}
                    {o.table && <span className="text-muted"> · {o.table.name}</span>}
                  </td>
                  <td className="text-muted">{o.cashier.name}</td>
                  <td className="uang text-right font-semibold">{rupiah(o.grandTotal)}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <StatusPill status={o.status} />
                      {o.needsReview && <Badge tone="red">Perlu review</Badge>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {pilihId && (
        <DetailOrder
          id={pilihId}
          bolehApprove={bolehApprove}
          onClose={tutupDetail}
          onBerubah={() => void muat()}
          kabar={kabar}
        />
      )}
      <Toast pesan={toast?.pesan ?? null} tone={toast?.tone} />
    </div>
  );
}

type Aksi = { jenis: "cancel" | "refund"; langkah: 1 | 2 } | null;

function DetailOrder({
  id,
  bolehApprove,
  onClose,
  onBerubah,
  kabar,
}: {
  id: string;
  bolehApprove: boolean;
  onClose: () => void;
  onBerubah: () => void;
  kabar: (pesan: string, tone?: "error" | "ok") => void;
}) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [aksi, setAksi] = useState<Aksi>(null);
  const [alasan, setAlasan] = useState("");
  const [nominal, setNominal] = useState("");
  const [approverEmail, setApproverEmail] = useState("");
  const [approverPin, setApproverPin] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [strukBuka, setStrukBuka] = useState<string | null>(null);
  const [strukRefund, setStrukRefund] = useState<string | null>(null);
  const [verifikasi, setVerifikasi] = useState<{ paymentId: string; setujui: boolean } | null>(null);

  const muat = useCallback(async () => {
    try {
      const d = await api<{ order: OrderDetail }>(`/api/orders/${id}`);
      setOrder(d.order);
    } catch (e) {
      kabar((e as Error).message);
      onClose();
    }
  }, [id, kabar, onClose]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const bayarLunas = order?.payments.find((p) => p.status === "PAID");
  const sisaRefund = bayarLunas ? bayarLunas.amount - bayarLunas.refundedAmount : 0;
  const bisaRefund = !!order && (order.status === "PAID" || order.status === "PARTIALLY_REFUNDED") && sisaRefund > 0;
  const jumlahRefund = Number(nominal);
  const refundValid =
    Number.isInteger(jumlahRefund) &&
    jumlahRefund > 0 &&
    jumlahRefund <= sisaRefund &&
    alasan.trim().length >= 3 &&
    (bolehApprove || (/\S+@\S+\.\S+/.test(approverEmail) && /^\d{4,6}$/.test(approverPin)));

  const mulaiAksi = (jenis: "cancel" | "refund") => {
    setAlasan("");
    setNominal(String(sisaRefund));
    setApproverEmail("");
    setApproverPin("");
    setStrukRefund(null);
    setAksi({ jenis, langkah: 1 });
  };

  const selesai = async (pesan: string) => {
    kabar(pesan, "ok");
    setAksi(null);
    onBerubah();
    await muat();
  };

  const batalkan = async () => {
    setSibuk(true);
    try {
      await api(`/api/orders/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason: alasan.trim() }) });
      await selesai("Order dibatalkan");
    } catch (e) {
      kabar((e as Error).message);
    } finally {
      setSibuk(false);
    }
  };

  const refund = async () => {
    if (!bayarLunas) return;
    setSibuk(true);
    try {
      const d = await api<{ receipt: StrukRow }>(`/api/payments/${bayarLunas.id}/refund`, {
        method: "POST",
        body: JSON.stringify({
          amount: jumlahRefund,
          reason: alasan.trim(),
          ...(bolehApprove ? {} : { approver: { email: approverEmail.trim(), pin: approverPin } }),
        }),
      });
      await selesai("Refund berhasil, struk refund terbit");
      setStrukRefund(strukTeks(d.receipt));
    } catch (e) {
      kabar((e as Error).message);
    } finally {
      setSibuk(false);
    }
  };

  const verifikasiTransfer = async () => {
    if (!verifikasi) return;
    setSibuk(true);
    try {
      await api(`/api/orders/${id}/payments/manual-proof`, { method: "PATCH", body: JSON.stringify(verifikasi) });
      kabar(verifikasi.setujui ? "Transfer disetujui, order lunas" : "Bukti transfer ditolak", "ok");
      onBerubah();
    } catch (e) {
      kabar((e as Error).message);
      onBerubah();
    } finally {
      setVerifikasi(null);
      setSibuk(false);
      await muat();
    }
  };

  const pembayaranReview = order?.payments.filter((p) => p.status === "NEEDS_REVIEW") ?? [];

  const review = async (paymentId: string, action: "ACCEPT" | "DISMISS") => {
    const note = window.prompt(
      action === "ACCEPT"
        ? "Konfirmasi dana sudah diterima. Tulis catatan review:"
        : "Tolak pembayaran ini. Tulis alasan:",
    );
    if (!note || note.trim().length < 3) return;
    setSibuk(true);
    try {
      await api(`/api/orders/${id}/review`, { method: "POST", body: JSON.stringify({ paymentId, action, note }) });
      kabar(action === "ACCEPT" ? "Pembayaran diterima, order lunas" : "Pembayaran ditolak", "ok");
      onBerubah();
    } catch (e) {
      kabar((e as Error).message);
    } finally {
      setSibuk(false);
      await muat();
    }
  };

  return (
    <Modal open onClose={onClose} title={order ? `Order ${order.orderNo}` : "Memuat…"} wide>
      {!order ? (
        <p className="py-8 text-center text-sm text-muted">Memuat detail…</p>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusPill status={order.status} />
            {order.needsReview && <Badge tone="red">Perlu review</Badge>}
            {order.oversold && <Badge tone="amber">Stok minus</Badge>}
            <span className="text-muted">
              {TIPE[order.type] ?? order.type}
              {order.table && ` · ${order.table.name}`}
              {order.guestCount ? ` · ${order.guestCount} tamu` : ""} · Kasir {order.cashier.name} ·{" "}
              {tanggalWaktu(order.createdAt)}
            </span>
          </div>

          {order.needsReview && (
            <div className="rounded-2xl bg-rose-500/10 p-4 ring-1 ring-rose-400/20">
              <p className="flex items-center gap-2 font-semibold text-rose-600">
                <AlertTriangle size={16} aria-hidden /> Nominal pembayaran tidak cocok, perlu review manager
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                <li>
                  Total order: <span className="uang font-semibold">{rupiah(order.grandTotal)}</span>
                </li>
                {pembayaranReview.map((p) => {
                  const diterima = p.amountReceived ?? p.amount;
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-2">
                      <span>
                        {METODE[p.method] ?? p.method} diterima:{" "}
                        <span className="uang font-semibold">{rupiah(diterima)}</span>{" "}
                        <span className="text-rose-600">
                          (selisih <span className="uang">{rupiah(diterima - order.grandTotal)}</span>)
                        </span>
                      </span>
                      {bolehApprove && (
                        <span className="ml-auto flex gap-2">
                          <Button size="sm" variant="success" disabled={sibuk} onClick={() => review(p.id, "ACCEPT")}>
                            Terima
                          </Button>
                          <Button size="sm" variant="danger" disabled={sibuk} onClick={() => review(p.id, "DISMISS")}>
                            Tolak
                          </Button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Item</h4>
            <ul className="neu-in divide-y divide-black/5 rounded-2xl px-4">
              {order.items.map((i) => (
                <li key={i.id} className="py-3">
                  <div className="flex justify-between gap-3">
                    <span className="font-semibold">
                      {i.qty}× {i.nameSnapshot}
                    </span>
                    <span className="uang">{rupiah(i.lineTotal)}</span>
                  </div>
                  {i.modifiers.map((m) => (
                    <p key={m.id} className="text-sm text-muted">
                      + {m.nameSnapshot}
                      {m.priceDelta ? <span className="uang"> ({rupiah(m.priceDelta)})</span> : null}
                    </p>
                  ))}
                  {i.note && <p className="text-sm italic text-brand-700">Catatan: {i.note}</p>}
                </li>
              ))}
            </ul>
            {order.note && <p className="mt-2 text-sm text-muted">Catatan order: {order.note}</p>}
          </section>

          <section className="neu-in space-y-1 rounded-2xl p-4 text-sm">
            <Baris label="Subtotal" nilai={order.subtotal} />
            {order.discount > 0 && <Baris label="Diskon" nilai={-order.discount} />}
            {order.service > 0 && <Baris label="Service" nilai={order.service} />}
            {order.tax > 0 && <Baris label="Pajak" nilai={order.tax} />}
            {order.rounding !== 0 && <Baris label="Pembulatan" nilai={order.rounding} />}
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
              <span>Total</span>
              <span className="uang text-grad">{rupiah(order.grandTotal)}</span>
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Pembayaran</h4>
            {order.payments.length === 0 ? (
              <Empty>Belum ada pembayaran.</Empty>
            ) : (
              <ul className="space-y-3">
                {order.payments.map((p) => (
                  <li key={p.id} className="neu-in rounded-2xl p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{METODE[p.method] ?? p.method}</span>
                      <StatusPill status={p.status} />
                    </div>
                    <div className="mt-2 grid gap-1 text-muted sm:grid-cols-2">
                      <span>
                        Nominal: <span className="uang text-fg">{rupiah(p.amount)}</span>
                      </span>
                      {p.amountReceived != null && (
                        <span>
                          Diterima: <span className="uang text-fg">{rupiah(p.amountReceived)}</span> · Kembali{" "}
                          <span className="uang text-fg">{rupiah(p.change ?? 0)}</span>
                        </span>
                      )}
                      {p.refundedAmount > 0 && (
                        <span>
                          Direfund: <span className="uang text-rose-600">{rupiah(p.refundedAmount)}</span>
                        </span>
                      )}
                      <span>{p.paidAt ? `Lunas ${tanggalWaktu(p.paidAt)}` : `Dibuat ${tanggalWaktu(p.createdAt)}`}</span>
                    </div>

                    {p.proofUrl && (
                      <div className="mt-3">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Bukti transfer</p>
                        {gambarBukti(p.proofUrl) ? (
                          <a href={p.proofUrl} target="_blank" rel="noreferrer">
                            <img
                              src={p.proofUrl}
                              alt="Bukti transfer"
                              className="max-h-64 rounded-xl ring-1 ring-black/10"
                            />
                          </a>
                        ) : (
                          <p className="break-all text-fg">{p.proofUrl}</p>
                        )}
                      </div>
                    )}

                    {p.method === "MANUAL_TRANSFER" && p.status === "PENDING" && (
                      <div className="mt-3">
                        {!bolehApprove ? (
                          <p className="text-xs text-amber-700">Menunggu verifikasi Manager/Owner.</p>
                        ) : verifikasi?.paymentId === p.id ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm">
                              {verifikasi.setujui
                                ? `Yakin dana ${rupiah(p.amount)} sudah masuk rekening?`
                                : "Yakin tolak bukti transfer ini?"}
                            </span>
                            <Button
                              variant={verifikasi.setujui ? "success" : "danger"}
                              disabled={sibuk}
                              onClick={() => void verifikasiTransfer()}
                            >
                              {verifikasi.setujui ? "Ya, setujui" : "Ya, tolak"}
                            </Button>
                            <Button variant="ghost" onClick={() => setVerifikasi(null)}>
                              Kembali
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <Button variant="success" onClick={() => setVerifikasi({ paymentId: p.id, setujui: true })}>
                              Approve
                            </Button>
                            <Button variant="danger" onClick={() => setVerifikasi({ paymentId: p.id, setujui: false })}>
                              Tolak
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {order.receipts.length > 0 && (
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Struk</h4>
              <div className="flex flex-wrap gap-2">
                {order.receipts.map((s) => (
                  <Button
                    key={s.id}
                    size="sm"
                    variant={strukBuka === s.id ? "primary" : "outline"}
                    onClick={() => setStrukBuka(strukBuka === s.id ? null : s.id)}
                  >
                    {s.receiptNo} · {s.kind}
                  </Button>
                ))}
              </div>
              {order.receipts
                .filter((s) => s.id === strukBuka)
                .map((s) => (
                  <pre key={s.id} className="struk mx-auto mt-3 w-fit max-w-full overflow-x-auto rounded-xl p-4">
                    {strukTeks(s)}
                  </pre>
                ))}
            </section>
          )}

          {strukRefund && (
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Struk refund terbit</h4>
              <pre className="struk mx-auto w-fit max-w-full overflow-x-auto rounded-xl p-4">{strukRefund}</pre>
            </section>
          )}

          {aksi?.jenis === "cancel" && (
            <section className="neu-in space-y-3 rounded-2xl p-4">
              <h4 className="font-bold text-rose-600">Batalkan order</h4>
              {aksi.langkah === 1 ? (
                <>
                  <Field label="Alasan pembatalan" hint="Minimal 3 karakter, tercatat di audit log.">
                    <Textarea rows={2} value={alasan} onChange={(e) => setAlasan(e.target.value)} />
                  </Field>
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      disabled={alasan.trim().length < 3}
                      onClick={() => setAksi({ jenis: "cancel", langkah: 2 })}
                    >
                      Lanjut
                    </Button>
                    <Button variant="ghost" onClick={() => setAksi(null)}>
                      Batal
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm">
                    Yakin batalkan <b>{order.orderNo}</b> ({rupiah(order.grandTotal)})? Alasan: “{alasan.trim()}”. Tindakan
                    ini tidak bisa dibatalkan.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="danger" disabled={sibuk} onClick={() => void batalkan()}>
                      Ya, batalkan order
                    </Button>
                    <Button variant="ghost" onClick={() => setAksi({ jenis: "cancel", langkah: 1 })}>
                      Kembali
                    </Button>
                  </div>
                </>
              )}
            </section>
          )}

          {aksi?.jenis === "refund" && bayarLunas && (
            <section className="neu-in space-y-3 rounded-2xl p-4">
              <h4 className="font-bold text-rose-600">Refund ke {METODE[bayarLunas.method] ?? bayarLunas.method}</h4>
              {aksi.langkah === 1 ? (
                <>
                  <Field label="Nominal refund (Rp)" hint={`Maksimal ${rupiah(sisaRefund)} (sisa yang belum direfund).`}>
                    <Input
                      inputMode="numeric"
                      value={nominal}
                      onChange={(e) => setNominal(e.target.value.replace(/\D/g, ""))}
                    />
                  </Field>
                  <Field label="Alasan refund">
                    <Textarea rows={2} value={alasan} onChange={(e) => setAlasan(e.target.value)} />
                  </Field>
                  {!bolehApprove && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <p className="text-xs text-amber-700 sm:col-span-2">
                        Refund oleh kasir wajib disetujui Manager/Owner: masukkan email dan PIN mereka.
                      </p>
                      <Field label="Email Manager">
                        <Input
                          type="email"
                          autoComplete="off"
                          value={approverEmail}
                          onChange={(e) => setApproverEmail(e.target.value)}
                        />
                      </Field>
                      <Field label="PIN Manager">
                        <Input
                          type="password"
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={6}
                          value={approverPin}
                          onChange={(e) => setApproverPin(e.target.value.replace(/\D/g, ""))}
                        />
                      </Field>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button variant="danger" disabled={!refundValid} onClick={() => setAksi({ jenis: "refund", langkah: 2 })}>
                      Lanjut
                    </Button>
                    <Button variant="ghost" onClick={() => setAksi(null)}>
                      Batal
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm">
                    Yakin refund <b className="uang">{rupiah(jumlahRefund)}</b> untuk <b>{order.orderNo}</b>
                    {jumlahRefund === sisaRefund ? " (penuh, stok dikembalikan)" : " (parsial)"}? Alasan: “{alasan.trim()}”.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="danger" disabled={sibuk} onClick={() => void refund()}>
                      Ya, proses refund
                    </Button>
                    <Button variant="ghost" onClick={() => setAksi({ jenis: "refund", langkah: 1 })}>
                      Kembali
                    </Button>
                  </div>
                </>
              )}
            </section>
          )}

          {!aksi && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              {order.status === "DRAFT" && (
                <Link
                  href={`/pos?order=${order.id}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-grad-brand px-4 text-sm font-semibold text-white shadow-glow hover:brightness-110"
                >
                  Buka di POS
                </Link>
              )}
              {belumBayar(order.status) && (
                <Button variant="danger" onClick={() => mulaiAksi("cancel")}>
                  Batalkan order
                </Button>
              )}
              {bisaRefund && (
                <Button variant="danger" onClick={() => mulaiAksi("refund")}>
                  Refund
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Baris({ label, nilai }: { label: string; nilai: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className="uang">{nilai < 0 ? `-${rupiah(-nilai)}` : rupiah(nilai)}</span>
    </div>
  );
}
