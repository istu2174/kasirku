import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { HttpError } from "@/lib/rbac";
import { pdfStruk, type ReceiptPayload } from "@/lib/receipt";

export const GET = route<{ id: string }>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const { outlet } = await konteks();

  const receipt = await prisma.receipt.findFirst({ where: { id, outletId: outlet.id } });
  if (!receipt) throw new HttpError(404, "Struk tidak ditemukan");

  const pdf = await pdfStruk(JSON.parse(receipt.payloadJson) as ReceiptPayload);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${receipt.receiptNo}.pdf"`,
    },
  });
});
