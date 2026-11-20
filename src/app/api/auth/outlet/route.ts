import { z } from "zod";
import { bacaJson, ok, route } from "@/lib/api";
import { sesiUntukOutlet, setDeviceCookie, setSessionCookie, wajibLogin } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Daftar outlet milik user + pindah outlet aktif (multi-outlet, FR-AUTH-04). */
export const GET = route(async () => {
  const sesi = await wajibLogin();
  const akses = await prisma.userOutlet.findMany({
    where: { userId: sesi.userId },
    include: { outlet: { select: { id: true, name: true, businessMode: true } } },
  });
  return ok({ aktif: sesi.outletId, outlets: akses.map((a) => ({ ...a.outlet, role: a.role })) });
});

const skema = z.object({ outletId: z.string().min(1) });

export const POST = route(async (req) => {
  const sesi = await wajibLogin();
  const { outletId } = skema.parse(await bacaJson(req));
  const baru = await sesiUntukOutlet(sesi.userId, outletId);
  await setSessionCookie(baru);
  await setDeviceCookie(outletId);
  return ok({ ok: true, role: baru.role });
});
