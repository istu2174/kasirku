import { z } from "zod";
import { bacaJson, ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { hashRahasia } from "@/lib/auth";
import { catatAudit } from "@/lib/audit";
import { HttpError } from "@/lib/rbac";

const skema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  role: z.enum(["OWNER", "MANAGER", "KASIR", "DAPUR", "GUDANG"]).optional(),
  password: z.string().min(8, "Sandi minimal 8 karakter").optional(),
  pin: z.string().regex(/^\d{4,6}$/, "PIN harus 4–6 digit angka").nullable().optional(),
});

export const PATCH = route<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const { sesi, outlet, tenantId } = await konteks("user.manage");
  const body = skema.parse(await bacaJson(req));

  const user = await prisma.user.findFirst({ where: { id, tenantId } });
  if (!user) throw new HttpError(404, "User tidak ditemukan");
  if (id === sesi.userId && body.status === "SUSPENDED") {
    throw new HttpError(400, "Tidak bisa menonaktifkan akun sendiri");
  }
  if (id === sesi.userId && body.role && body.role !== sesi.role) {
    throw new HttpError(400, "Tidak bisa mengubah role akun sendiri");
  }

  const hasil = await prisma.user.update({
    where: { id },
    data: {
      status: body.status ?? undefined,
      passwordHash: body.password ? await hashRahasia(body.password) : undefined,
      pinHash: body.pin === null ? null : body.pin ? await hashRahasia(body.pin) : undefined,
    },
  });

  if (body.role) {
    await prisma.userOutlet.updateMany({ where: { userId: id, outletId: outlet.id }, data: { role: body.role } });
  }

  await catatAudit({
    tenantId,
    outletId: outlet.id,
    userId: sesi.userId,
    action: "USER_UPDATE",
    entity: "User",
    entityId: id,
    before: { status: user.status },
    after: {
      status: hasil.status,
      role: body.role,
      passwordDiubah: body.password ? true : undefined,
      pin: body.pin === null ? "dihapus" : body.pin ? "direset" : undefined,
    },
  });

  return ok({ user: { ...hasil, passwordHash: undefined, pinHash: undefined } });
});
