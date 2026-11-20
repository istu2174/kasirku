import { z } from "zod";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { dateKey, tanggalWaktu } from "@/lib/format";
import { konteks } from "@/lib/session-context";
import { rentangQuery, voidRefund } from "../_laporan";

const csvEscape = (v: string | number) => {
  // Teks bebas (alasan, nama) yang diawali = + - @ bisa dieksekusi Excel sebagai formula.
  const s = typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Export CSV: penjualan (from/to), void & refund (from/to), atau stok saat ini (PRD FR-RPT-05). */
export const GET = route(async (req) => {
  const { outlet } = await konteks("report.view");
  const url = new URL(req.url);
  const tipe = z.enum(["sales", "refunds", "stock"]).parse(url.searchParams.get("type") || "sales");

  let header: string[];
  let rows: (string | number)[][];
  let akhiran = dateKey(new Date(), outlet.timezone);

  if (tipe === "stock") {
    const stok = await prisma.stock.findMany({
      where: { outletId: outlet.id },
      include: { product: true },
      orderBy: { product: { name: "asc" } },
    });
    header = ["SKU", "Nama", "Barcode", "Stok", "Min", "Harga Jual", "Nilai Stok"];
    rows = stok.map((s) => [
      s.product.sku,
      s.product.name,
      s.product.barcode ?? "",
      s.qty,
      s.minQty,
      s.product.price,
      s.qty * s.product.price,
    ]);
  } else {
    const { mulai, selesai } = rentangQuery(url, outlet.timezone);
    akhiran = `${dateKey(mulai, outlet.timezone)}-${dateKey(new Date(selesai.getTime() - 1), outlet.timezone)}`;

    if (tipe === "refunds") {
      const { refunds, batal } = await voidRefund(outlet.id, mulai, selesai);
      header = ["Jenis", "Waktu", "No Order", "Metode", "Jumlah", "Alasan", "Oleh"];
      rows = [
        ...refunds.map((r) => ["REFUND", tanggalWaktu(r.waktu), r.orderNo, r.metode, r.jumlah, r.alasan, r.oleh]),
        ...batal.map((b) => ["BATAL", tanggalWaktu(b.waktu), b.orderNo, "-", b.total, b.alasan, b.kasir]),
      ];
    } else {
      const orders = await prisma.order.findMany({
        where: {
          outletId: outlet.id,
          status: { in: ["PAID", "REFUNDED", "PARTIALLY_REFUNDED"] },
          paidAt: { gte: mulai, lt: selesai },
        },
        include: { cashier: { select: { name: true } }, payments: { select: { status: true, method: true } } },
        orderBy: { paidAt: "desc" },
        take: 20000,
      });
      header = ["No Order", "Tanggal", "Kasir", "Status", "Metode", "Subtotal", "Diskon", "Service", "Pajak", "Pembulatan", "Total"];
      rows = orders.map((o) => [
        o.orderNo,
        tanggalWaktu(o.paidAt ?? o.createdAt),
        o.cashier.name,
        o.status,
        o.payments.find((p) => p.status === "PAID" || p.status === "REFUNDED")?.method ?? "-",
        o.subtotal,
        o.discount,
        o.service,
        o.tax,
        o.rounding,
        o.grandTotal,
      ]);
    }
  }

  const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${tipe}-${outlet.code}-${akhiran}.csv"`,
    },
  });
});
