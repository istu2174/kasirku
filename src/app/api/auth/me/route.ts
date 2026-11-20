import { ok, route } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { shiftAktif } from "@/lib/order-service";

export const GET = route(async () => {
  const sesi = await getSession();
  if (!sesi) return ok({ user: null }, 200);

  const outlet = await prisma.outlet.findUnique({ where: { id: sesi.outletId } });
  const shift = await shiftAktif(sesi.outletId);
  return ok({ user: sesi, outlet, shift });
});
