import { ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { strukKedaluwarsa } from "@/app/r/[token]/kedaluwarsa";

/** Struk digital publik: akses lewat token acak, tanpa login. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const receipt = await prisma.receipt.findUnique({
    where: { digitalToken: token },
    include: { order: { select: { orderNo: true, status: true } } },
  });
  if (!receipt) return ok({ error: "Struk tidak ditemukan" }, 404);
  if (strukKedaluwarsa(receipt.issuedAt)) return ok({ error: "Struk digital sudah kedaluwarsa" }, 410);

  return ok({
    receipt: {
      receiptNo: receipt.receiptNo,
      kind: receipt.kind,
      issuedAt: receipt.issuedAt,
      payload: JSON.parse(receipt.payloadJson),
    },
    order: receipt.order,
  });
}
