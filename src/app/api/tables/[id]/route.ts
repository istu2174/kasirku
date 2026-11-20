import { z } from "zod";
import { bacaJson, ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { HttpError } from "@/lib/rbac";

const skema = z.object({ status: z.enum(["KOSONG", "TERISI", "RESERVASI", "PERLU_DIBERSIHKAN"]) });

export const PATCH = route<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const { outlet } = await konteks("kds.view");
  const body = skema.parse(await bacaJson(req));

  const meja = await prisma.diningTable.findFirst({ where: { id, outletId: outlet.id } });
  if (!meja) throw new HttpError(404, "Meja tidak ditemukan");

  const hasil = await prisma.diningTable.update({ where: { id }, data: { status: body.status } });
  return ok({ table: hasil });
});
