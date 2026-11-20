import { ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";

export const GET = route(async (req) => {
  const { outlet } = await konteks();
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
  const productId = url.searchParams.get("productId") ?? undefined;

  const movements = await prisma.stockMovement.findMany({
    where: { outletId: outlet.id, ...(productId ? { productId } : {}) },
    include: { product: { select: { name: true, imageEmoji: true, sku: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // StockMovement tidak punya relasi ke User/Order; ambil nama & nomor order sekaligus.
  const userIds = [...new Set(movements.flatMap((m) => (m.userId ? [m.userId] : [])))];
  const orderIds = [...new Set(movements.flatMap((m) => (m.refType === "ORDER" && m.refId ? [m.refId] : [])))];
  const [users, orders] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
    prisma.order.findMany({ where: { id: { in: orderIds }, outletId: outlet.id }, select: { id: true, orderNo: true } }),
  ]);
  const namaUser = new Map(users.map((u) => [u.id, u.name]));
  const noOrder = new Map(orders.map((o) => [o.id, o.orderNo]));

  return ok({
    movements: movements.map((m) => ({
      ...m,
      userName: m.userId ? (namaUser.get(m.userId) ?? null) : null,
      orderNo: m.refId ? (noOrder.get(m.refId) ?? null) : null,
    })),
  });
});
