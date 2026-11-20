import { ok } from "@/lib/api";
import { prosesWebhook } from "@/lib/payments/webhook-service";

/**
 * Endpoint webhook publik (tanpa sesi). Body mentah dipakai untuk verifikasi signature,
 * jadi jangan di-parse dulu. Selalu balas cepat; proses berat ada di service.
 */
export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const rawBody = await req.text();

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  try {
    const hasil = await prosesWebhook(provider, rawBody, headers);
    return ok(hasil.body, hasil.status);
  } catch (err) {
    console.error("[webhook]", err);
    // Tetap 200 supaya gateway tidak retry tanpa henti untuk error internal kita?
    // Tidak: error internal harus retry, jadi balas 500.
    return ok({ error: "Gagal memproses webhook" }, 500);
  }
}
