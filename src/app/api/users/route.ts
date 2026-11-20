import { z } from "zod";
import { bacaJson, ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { hashRahasia } from "@/lib/auth";
import { catatAudit } from "@/lib/audit";
import { HttpError } from "@/lib/rbac";

export const GET = route(async () => {
  const { outlet } = await konteks("user.manage");
  const users = await prisma.user.findMany({
    where: { tenantId: outlet.tenantId, outlets: { some: { outletId: outlet.id } } },
    include: { outlets: { where: { outletId: outlet.id }, select: { role: true } } },
    orderBy: { name: "asc" },
  });
  return ok({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      status: u.status,
      createdAt: u.createdAt,
      role: u.outlets[0]?.role ?? null,
      punyaPin: Boolean(u.pinHash),
    })),
  });
});

const skema = z.object({
  name: z.string().trim().min(2),
  email: z.string().email(),
  password: z.string().min(6, "Password minimal 6 karakter"),
  pin: z.string().regex(/^\d{4,6}$/, "PIN harus 4–6 digit angka").optional(),
  role: z.enum(["OWNER", "MANAGER", "KASIR", "DAPUR", "GUDANG"]),
});

export const POST = route(async (req) => {
  const { sesi, outlet, tenantId } = await konteks("user.manage");
  const body = skema.parse(await bacaJson(req));

  const ada = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
  if (ada) throw new HttpError(409, "Email sudah dipakai");

  const user = await prisma.user.create({
    data: {
      tenantId,
      name: body.name,
      email: body.email.toLowerCase(),
      passwordHash: await hashRahasia(body.password),
      pinHash: body.pin ? await hashRahasia(body.pin) : null,
      outlets: { create: [{ outletId: outlet.id, role: body.role }] },
    },
  });

  await catatAudit({
    tenantId,
    outletId: outlet.id,
    userId: sesi.userId,
    action: "USER_CREATE",
    entity: "User",
    entityId: user.id,
    after: { email: user.email, role: body.role },
  });

  return ok({ user: { ...user, passwordHash: undefined, pinHash: undefined } }, 201);
});
