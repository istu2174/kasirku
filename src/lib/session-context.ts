import "server-only";
import { prisma } from "@/lib/db";
import { wajibLogin } from "@/lib/auth";
import { wajibIzin, type Permission } from "@/lib/rbac";
import type { SessionData } from "@/lib/auth";

/** Ambil sesi + outlet + tenant, sekaligus cek izin. Dipakai semua route API. */
export async function konteks(izin?: Permission): Promise<{
  sesi: SessionData;
  outlet: { id: string; tenantId: string; code: string; timezone: string; name: string };
  tenantId: string;
}> {
  const sesi = await wajibLogin();
  if (izin) wajibIzin(sesi.role, izin);
  const outlet = await prisma.outlet.findUniqueOrThrow({
    where: { id: sesi.outletId },
    select: { id: true, tenantId: true, code: true, timezone: true, name: true },
  });
  return { sesi, outlet, tenantId: outlet.tenantId };
}
