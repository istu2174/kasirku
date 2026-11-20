import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { parseTaxConfig } from "@/lib/money";
import PosClient, { type BarisAwal, type Produk, type Rekening } from "@/components/PosClient";

function bacaRekening(raw: string): Rekening {
  try {
    const r = JSON.parse(raw) as Partial<Rekening>;
    return {
      bankName: String(r.bankName ?? ""),
      bankAccountNo: String(r.bankAccountNo ?? ""),
      bankAccountName: String(r.bankAccountName ?? ""),
    };
  } catch {
    return { bankName: "", bankAccountNo: "", bankAccountName: "" };
  }
}

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; table?: string }>;
}) {
  const sesi = await getSession();
  if (!sesi) redirect("/login");
  if (!can(sesi.role, "order.create")) redirect("/");
  const { order: orderId, table } = await searchParams;

  const [outlet, produk, kategori, meja, stok, shift] = await Promise.all([
    prisma.outlet.findUniqueOrThrow({ where: { id: sesi.outletId } }),
    prisma.product.findMany({
      where: { outletId: sesi.outletId, isActive: true },
      include: { variants: true, modifierGroups: { include: { modifiers: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({ where: { outletId: sesi.outletId }, orderBy: { sortOrder: "asc" } }),
    prisma.diningTable.findMany({ where: { outletId: sesi.outletId }, orderBy: { name: "asc" } }),
    prisma.stock.findMany({ where: { outletId: sesi.outletId } }),
    prisma.shift.findFirst({ where: { outletId: sesi.outletId, status: "OPEN" } }),
  ]);
  const petaStok = new Map(stok.map((s) => [s.productId, s.qty]));

  // Buka kembali bill tertahan (hold bill) dari /pos?order=<id>.
  const orderAwal = orderId
    ? await prisma.order.findFirst({
        where: { id: orderId, outletId: sesi.outletId, status: { in: ["DRAFT", "CONFIRMED"] } },
        include: { items: { include: { modifiers: true, product: { select: { imageEmoji: true } } } } },
      })
    : null;

  const data: Produk[] = produk.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    imageEmoji: p.imageEmoji,
    sku: p.sku,
    barcode: p.barcode,
    stock: petaStok.get(p.id) ?? 0,
    trackStock: p.trackStock,
    categoryId: p.categoryId,
    variants: p.variants.map((v) => ({ id: v.id, name: v.name, priceDelta: v.priceDelta })),
    modifierGroups: p.modifierGroups.map((g) => ({
      id: g.id,
      name: g.name,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      modifiers: g.modifiers.map((m) => ({ id: m.id, name: m.name, priceDelta: m.priceDelta })),
    })),
  }));

  const barisAwal: BarisAwal | null = orderAwal
    ? {
        order: {
          id: orderAwal.id,
          orderNo: orderAwal.orderNo,
          status: orderAwal.status,
          type: orderAwal.type,
          tableId: orderAwal.tableId,
        },
        items: orderAwal.items.map((i) => ({
          key: i.id,
          productId: i.productId,
          variantId: i.variantId,
          name: i.nameSnapshot,
          emoji: i.product.imageEmoji,
          unitPrice: i.unitPrice,
          modifierIds: i.modifiers.map((m) => m.modifierId),
          modifiers: i.modifiers.map((m) => ({ name: m.nameSnapshot, priceDelta: m.priceDelta })),
          qty: i.qty,
          note: i.note ?? "",
        })),
      }
    : null;

  return (
    <PosClient
      key={orderAwal?.id ?? table ?? "baru"}
      produk={data}
      kategori={kategori.map((k) => ({ id: k.id, name: k.name }))}
      meja={meja.map((m) => ({ id: m.id, name: m.name, status: m.status }))}
      config={parseTaxConfig(outlet.taxConfig)}
      outlet={{ name: outlet.name, address: outlet.address, phone: outlet.phone, code: outlet.code }}
      kasir={sesi.name}
      tipeBisnis={outlet.businessMode}
      shiftAktif={Boolean(shift)}
      barisAwal={barisAwal}
      mejaAwal={table ?? null}
      // Provider fake = mode demo (lokal maupun online) sampai gateway asli disambung.
      modeDev={(process.env.PAYMENT_PROVIDER ?? "fake").toLowerCase() === "fake"}
      rekening={bacaRekening(outlet.receiptConfig)}
      bolehApprove={can(sesi.role, "order.void")}
    />
  );
}
