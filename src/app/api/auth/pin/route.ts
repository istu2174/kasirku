import { z } from "zod";
import { bacaJson, ok, route } from "@/lib/api";
import { bacaDeviceOutlet, cekRateLimit, resetRateLimit, sesiUntukOutlet, setSessionCookie, verifikasiPin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/rbac";

/**
 * Login cepat dengan PIN di perangkat yang sudah pernah login email (FR-AUTH-02).
 * Outlet diambil dari cookie perangkat, bukan dari input user.
 */
export const GET = route(async () => {
  const outletId = await bacaDeviceOutlet();
  if (!outletId) return ok({ outlet: null, users: [] });
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId }, select: { id: true, name: true } });
  if (!outlet) return ok({ outlet: null, users: [] });
  const akses = await prisma.userOutlet.findMany({
    where: { outletId, user: { status: "ACTIVE", pinHash: { not: null } } },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return ok({ outlet, users: akses.map((a) => ({ id: a.user.id, name: a.user.name, role: a.role })) });
});

const skema = z.object({
  userId: z.string().min(1),
  pin: z.string().regex(/^\d{4,6}$/, "PIN harus 4–6 digit"),
});

export const POST = route(async (req) => {
  const outletId = await bacaDeviceOutlet();
  if (!outletId) throw new HttpError(400, "Perangkat belum terdaftar. Login dengan email dulu.");

  const { userId, pin } = skema.parse(await bacaJson(req));
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  cekRateLimit(`pin-ip:${ip}`, `pin-akun:${userId}`);

  if (!(await verifikasiPin(userId, pin))) throw new HttpError(401, "PIN salah");
  resetRateLimit(`pin-ip:${ip}`, `pin-akun:${userId}`);

  const sesi = await sesiUntukOutlet(userId, outletId);
  await setSessionCookie(sesi);
  return ok({ ok: true, name: sesi.name, role: sesi.role });
});
