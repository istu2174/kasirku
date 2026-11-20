import { ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { HttpError } from "@/lib/rbac";
import { cetakUlang } from "@/lib/print-worker";
import { catatAudit } from "@/lib/audit";

/** Cetak ulang: struk asli tetap, hanya tambah job + label REPRINT di UI. */
export const POST = route<{ id: string }>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const { sesi, outlet, tenantId } = await konteks("order.create");

  const receipt = await prisma.receipt.findFirst({ where: { id, outletId: outlet.id } });
  if (!receipt) throw new HttpError(404, "Struk tidak ditemukan");

  const job = await cetakUlang(receipt.id);
  await catatAudit({
    tenantId,
    outletId: outlet.id,
    userId: sesi.userId,
    action: "RECEIPT_REPRINT",
    entity: "Receipt",
    entityId: receipt.id,
    after: { receiptNo: receipt.receiptNo, jobId: job.id },
  });

  return ok({ job, receiptNo: receipt.receiptNo, reprint: true });
});
