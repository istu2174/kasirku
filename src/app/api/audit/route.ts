import { z } from "zod";
import { ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";

const Query = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  // Nama aksi persis (ORDER_CANCEL) atau prefix diakhiri * (PRODUCT_*).
  action: z
    .string()
    .regex(/^[A-Z_]+\*?$/)
    .optional(),
  cursor: z.string().min(1).optional(),
});

/** Audit log read-only: tidak ada endpoint ubah/hapus. */
export const GET = route(async (req) => {
  const { outlet } = await konteks("audit.view");
  const sp = new URL(req.url).searchParams;
  const q = Query.parse({
    limit: sp.get("limit") || undefined,
    action: sp.get("action") || undefined,
    cursor: sp.get("cursor") || undefined,
  });

  const action = q.action?.endsWith("*") ? { startsWith: q.action.slice(0, -1) } : q.action;

  const [logs, daftarAksi] = await Promise.all([
    prisma.auditLog.findMany({
      where: { outletId: outlet.id, action },
      include: { user: { select: { name: true, email: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    }),
    prisma.auditLog.groupBy({ by: ["action"], where: { outletId: outlet.id } }),
  ]);

  const adaLagi = logs.length > q.limit;
  const halaman = adaLagi ? logs.slice(0, q.limit) : logs;
  return ok({
    logs: halaman,
    nextCursor: adaLagi ? halaman[halaman.length - 1].id : null,
    aksi: daftarAksi.map((a) => a.action).sort(),
  });
});
