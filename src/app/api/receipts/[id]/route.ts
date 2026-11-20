import { ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { HttpError } from "@/lib/rbac";

export const GET = route<{ id: string }>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const { outlet } = await konteks();

  const receipt = await prisma.receipt.findFirst({
    where: { id, outletId: outlet.id },
    include: { jobs: { orderBy: { createdAt: "desc" } }, order: true },
  });
  if (!receipt) throw new HttpError(404, "Struk tidak ditemukan");

  return ok({
    receipt,
    payload: JSON.parse(receipt.payloadJson),
  });
});
