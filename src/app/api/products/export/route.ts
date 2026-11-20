import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { dateKey } from "@/lib/format";
import { keCsv } from "../import/csv";

/** Export produk outlet ke CSV dengan kolom yang sama dengan format import. */
export const GET = route(async () => {
  const { outlet } = await konteks("product.edit");
  const produk = await prisma.product.findMany({
    where: { outletId: outlet.id },
    include: { category: true, stocks: { where: { outletId: outlet.id } } },
    orderBy: { name: "asc" },
  });

  const csv = keCsv(
    ["name", "sku", "barcode", "category", "price", "cost", "emoji", "trackStock", "minQty", "stock", "active"],
    produk.map((p) => [
      p.name,
      p.sku,
      p.barcode,
      p.category?.name ?? "",
      p.price,
      p.cost,
      p.imageEmoji,
      p.trackStock ? 1 : 0,
      p.stocks[0]?.minQty ?? p.minQty,
      p.trackStock ? (p.stocks[0]?.qty ?? 0) : "",
      p.isActive ? 1 : 0,
    ]),
  );

  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="produk-${outlet.code}-${dateKey()}.csv"`,
    },
  });
});
