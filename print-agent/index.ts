/**
 * Print agent lokal KasirKu: menerima struk dari server/browser lalu meneruskan
 * byte ESC/POS ke printer thermal (jaringan, USB/device, share Windows) atau stdout.
 *
 * Env: PRINT_AGENT_TOKEN (wajib), PRINTER_TARGET (stdout | tcp://ip:9100 | path device/share),
 *      PRINT_AGENT_PORT (default 9100), PRINT_AGENT_HOST (default 127.0.0.1).
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import { keEscPos, type IsiCetak } from "./escpos";

try {
  process.loadEnvFile(); // baca .env di folder kerja kalau ada
} catch {
  // .env opsional; env bisa diset langsung oleh pm2/nssm.
}

const PORT = Number(process.env.PRINT_AGENT_PORT ?? 9100);
const HOST = process.env.PRINT_AGENT_HOST ?? "127.0.0.1";
const TOKEN = process.env.PRINT_AGENT_TOKEN ?? "";
const TARGET = process.env.PRINTER_TARGET ?? "stdout";
const BATAS_BODY = 64 * 1024;
const ORIGIN_LOKAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

if (!TOKEN) {
  console.error("[print-agent] PRINT_AGENT_TOKEN belum diset. Agent menolak jalan tanpa token.");
  process.exit(1);
}

function tokenCocok(diberikan: string | undefined): boolean {
  if (!diberikan) return false;
  const a = Buffer.from(diberikan);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function validasi(data: unknown): IsiCetak {
  const d = data as Partial<IsiCetak> | null;
  if (!d || typeof d.text !== "string" || !d.text.length) throw new Error("text wajib berupa string");
  if (d.width !== 32 && d.width !== 48) throw new Error("width harus 32 atau 48");
  if (d.qr !== undefined && typeof d.qr !== "string") throw new Error("qr harus string");
  if (d.qr && d.qr.length > 500) throw new Error("qr terlalu panjang");
  if (d.cut !== undefined && typeof d.cut !== "boolean") throw new Error("cut harus boolean");
  return { text: d.text, width: d.width, qr: d.qr || undefined, cut: d.cut ?? true };
}

function kirimTcp(alamat: string, data: Buffer): Promise<void> {
  const url = new URL(alamat);
  return new Promise((resolve, reject) => {
    const soket = net.connect({ host: url.hostname, port: Number(url.port || 9100) });
    soket.setTimeout(5000, () => soket.destroy(new Error("Printer jaringan tidak merespons (timeout 5 detik)")));
    soket.once("error", reject);
    soket.once("connect", () => soket.end(data));
    soket.once("close", (gagal) => (gagal ? undefined : resolve()));
  });
}

async function cetak(isi: IsiCetak): Promise<void> {
  if (TARGET === "stdout") {
    console.log(`\n${"=".repeat(isi.width)}\n${isi.text}`);
    if (isi.qr) console.log(`[QR] ${isi.qr}`);
    if (isi.cut) console.log("[POTONG KERTAS]");
    return;
  }
  const data = keEscPos(isi);
  if (TARGET.startsWith("tcp://")) return kirimTcp(TARGET, data);
  // Path device (/dev/usb/lp0) atau share printer Windows (\\localhost\XP58).
  await fs.writeFile(TARGET, data);
}

function bacaBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let ukuran = 0;
    const potongan: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      ukuran += c.length;
      if (ukuran > BATAS_BODY) {
        reject(new Error("Body terlalu besar"));
        req.destroy();
        return;
      }
      potongan.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(potongan).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && ORIGIN_LOKAL.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-agent-token");
  }
  const balas = (status: number, body: Record<string, unknown>) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (req.method === "OPTIONS") {
    res.writeHead(origin && ORIGIN_LOKAL.test(origin) ? 204 : 403);
    res.end();
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    balas(200, { ok: true, target: TARGET.startsWith("tcp://") ? "tcp" : TARGET === "stdout" ? "stdout" : "device" });
    return;
  }
  if (req.method !== "POST" || req.url !== "/print") {
    balas(404, { error: "Tidak ditemukan" });
    return;
  }

  const token = req.headers["x-agent-token"];
  if (!tokenCocok(Array.isArray(token) ? token[0] : token)) {
    balas(401, { error: "Token agent salah" });
    return;
  }

  let isi: IsiCetak;
  try {
    isi = validasi(JSON.parse(await bacaBody(req)));
  } catch (err) {
    balas(400, { error: err instanceof Error ? err.message : "Body tidak valid" });
    return;
  }

  try {
    await cetak(isi);
    balas(200, { ok: true });
  } catch (err) {
    const pesan = err instanceof Error ? err.message : "Gagal mencetak";
    console.error("[print-agent]", pesan);
    // 502: server KasirKu menandai job FAILED dan retry; struk tidak hilang.
    balas(502, { error: pesan });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[print-agent] siap di http://${HOST}:${PORT} → target: ${TARGET}`);
});
