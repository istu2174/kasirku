import type { Metadata } from "next";
import { Download, Receipt } from "lucide-react";
import { prisma } from "@/lib/db";
import { teksStruk, type ReceiptPayload } from "@/lib/struk";
import { tanggalWaktu } from "@/lib/format";
import { strukKedaluwarsa } from "./kedaluwarsa";

export const metadata: Metadata = {
  title: "Struk Digital — KasirKu",
  robots: { index: false, follow: false },
};

/** Struk digital publik (tanpa login). Akses via token acak, berlaku 30 hari. */
export default async function StrukDigitalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const receipt = await prisma.receipt.findUnique({ where: { digitalToken: token } });

  if (!receipt || strukKedaluwarsa(receipt.issuedAt)) {
    return (
      <main className="grid min-h-screen place-items-center p-4">
        <div className="neu max-w-sm p-8 text-center">
          <Receipt className="mx-auto mb-3 text-brand-300" size={36} aria-hidden />
          <h1 className="text-grad text-xl font-extrabold">
            {receipt ? "Struk sudah kedaluwarsa" : "Struk tidak ditemukan"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {receipt
              ? `Struk digital hanya berlaku 30 hari sejak terbit (${tanggalWaktu(receipt.issuedAt)}). Hubungi outlet bila butuh salinan.`
              : "Tautan struk tidak valid. Periksa kembali QR atau tautan yang Anda terima."}
          </p>
        </div>
      </main>
    );
  }

  const payload = JSON.parse(receipt.payloadJson) as ReceiptPayload;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center gap-5 px-4 py-8">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Struk digital</p>
        <h1 className="text-grad text-2xl font-extrabold">{payload.outlet.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {receipt.receiptNo} · {tanggalWaktu(receipt.issuedAt)}
        </p>
      </div>

      <div className="neu w-full p-3">
        <pre className="struk overflow-x-auto rounded-xl p-4">{teksStruk(payload, 32)}</pre>
      </div>

      <a
        href={`/api/public/receipt/${token}/pdf`}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-grad-brand px-6 text-sm font-semibold text-white shadow-glow hover:brightness-110"
      >
        <Download size={16} aria-hidden /> Unduh PDF
      </a>
      <p className="text-center text-xs text-muted">Berlaku sampai 30 hari sejak struk terbit.</p>
    </main>
  );
}
