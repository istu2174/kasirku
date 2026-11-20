import { z } from "zod";
import { bacaJson, ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { verifikasiApprover } from "@/lib/auth";
import { refundPayment } from "@/lib/refund-service";
import { can, HttpError, type Role } from "@/lib/rbac";

const skema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().trim().min(3, "Alasan refund wajib diisi"),
  // Wajib kalau yang mengajukan bukan Owner/Manager (PRD §4: kasir butuh approval).
  approver: z.object({ email: z.string().email(), pin: z.string().regex(/^\d{4,6}$/) }).optional(),
});

export const POST = route<{ id: string }>(async (req, ctx) => {
  const { id } = await ctx.params;
  const { sesi, outlet, tenantId } = await konteks("order.create");
  const body = skema.parse(await bacaJson(req));

  let approverId = sesi.userId;
  if (!can(sesi.role, "order.void")) {
    if (!body.approver) throw new HttpError(403, "Refund butuh persetujuan Manager/Owner");
    approverId = await verifikasiApprover(body.approver.email, body.approver.pin, outlet.id);
  }

  const hasil = await refundPayment(
    { outletId: outlet.id, userId: sesi.userId, tenantId, approverId },
    id,
    body.amount,
    body.reason,
  );

  return ok({ refund: hasil.refund, receipt: hasil.struk });
});
