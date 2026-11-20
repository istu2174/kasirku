import { prisma } from "@/lib/db";
import { pdfStruk, type ReceiptPayload } from "@/lib/receipt";
import { strukKedaluwarsa } from "@/app/r/[token]/kedaluwarsa";

/** PDF struk digital publik (tanpa login, via token acak). Ditolak setelah 30 hari (PRD §9.2). */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const receipt = await prisma.receipt.findUnique({ where: { digitalToken: token } });
  if (!receipt) return Response.json({ error: "Struk tidak ditemukan" }, { status: 404 });
  if (strukKedaluwarsa(receipt.issuedAt)) {
    return Response.json({ error: "Struk digital sudah kedaluwarsa" }, { status: 410 });
  }

  const pdf = await pdfStruk(JSON.parse(receipt.payloadJson) as ReceiptPayload);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${receipt.receiptNo}.pdf"`,
    },
  });
}
