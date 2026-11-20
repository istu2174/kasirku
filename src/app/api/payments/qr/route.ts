import QRCode from "qrcode";
import { route } from "@/lib/api";

/** Render QR dari string apa pun (dipakai untuk QRIS demo). */
export const GET = route(async (req) => {
  const data = new URL(req.url).searchParams.get("data") ?? "";
  if (!data) return new Response("data kosong", { status: 400 });

  const png = await QRCode.toBuffer(data, { width: 320, margin: 1 });
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=300" },
  });
});
