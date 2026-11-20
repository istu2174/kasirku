import "server-only";
import { prisma } from "@/lib/db";

type AuditInput = {
  tenantId: string;
  outletId?: string | null;
  userId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
};

/**
 * Audit log immutable: hanya insert, tidak pernah update/delete.
 * Dipakai untuk void, refund, ubah harga, hapus produk, buka/tutup shift.
 */
export async function catatAudit(input: AuditInput) {
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      outletId: input.outletId ?? null,
      userId: input.userId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      before: input.before === undefined ? null : JSON.stringify(input.before),
      after: input.after === undefined ? null : JSON.stringify(input.after),
      ip: input.ip ?? null,
    },
  });
}
