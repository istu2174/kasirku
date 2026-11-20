# KasirKu — POS Web untuk Kafe, Restoran & Minimarket

Aplikasi kasir berbasis web (PWA): buat pesanan → bayar **Cash / QRIS / Transfer VA** → sistem konfirmasi pembayaran → **struk otomatis tercetak**. Satu codebase untuk tiga mode bisnis (Kafe, Restoran, Minimarket), tema neumorphism gelap (hitam + gradasi ungu → putih).

- Next.js 15 (App Router) + TypeScript strict + Tailwind
- Prisma (SQLite untuk dev lokal, Postgres 16 untuk production)
- Queue: BullMQ + Redis (otomatis kalau `REDIS_URL` diisi), fallback in-memory untuk dev
- Zod di semua input server, RBAC dicek di server
- Dexie (IndexedDB) + Service Worker untuk mode offline cash
- Vitest (unit + webhook) & Playwright (E2E)

**Deploy online gratis (GitHub → Render + Neon): [DEPLOY.md](DEPLOY.md).** Arsitektur & diagram alur: [docs/architecture.md](docs/architecture.md). Print agent: [print-agent/README.md](print-agent/README.md).

---

## 1. Setup cepat (tanpa Docker)

Butuh Node.js ≥ 20.

```bash
npm install            # atau: pnpm install
cp .env.example .env   # Windows: copy .env.example .env
npm run bootstrap      # buat tabel SQLite + seed data contoh (aman diulang, tidak menimpa)
npm run dev            # http://localhost:3000
```

`pnpm install && pnpm dev` juga jalan kalau pnpm terpasang (jalankan `pnpm bootstrap` sekali sebelumnya).

Reset data contoh kapan saja: `npm run db:seed` (menghapus semua transaksi lalu seed ulang).

### Akun demo

| Role | Email | Password | PIN |
|---|---|---|---|
| Owner | owner@kasirku.id | owner123 | 0000 |
| Manager | manager@kasirku.id | manager123 | 5678 |
| Kasir | kasir@kasirku.id | kasir123 | 1234 |
| Dapur | dapur@kasirku.id | dapur123 | — |
| Gudang | gudang@kasirku.id | gudang123 | — |

Owner, Manager, dan Kasir ditugaskan ke tiga outlet: **KasirKu Coffee** (kode `CRB`, kafe), **KasirKu Resto** (`RST`), **KasirKu Mart** (`MKT`). Ganti outlet lewat dropdown di sidebar.

**Login PIN:** setelah satu kali login email di sebuah perangkat, tab "PIN Kasir" di halaman login menampilkan staf outlet itu. Pilih nama → ketik PIN.

## 2. Production (Postgres)

Panduan lengkap gratis: **[DEPLOY.md](DEPLOY.md)** (Render + Neon, pakai `render.yaml`).

Cara kerjanya: `scripts/db-provider.mjs` membaca `DATABASE_URL` — kalau diawali `postgres://`, provider Prisma otomatis diganti ke `postgresql` sebelum `prisma generate`. Jadi lokal tetap SQLite tanpa edit apa pun. `npm run start:prod` = buat/ubah tabel (`prisma db push`, tanpa hapus data) → seed sekali kalau DB kosong → `next start`.

Di server online (Postgres), seed **menolak** password demo: semua akun awal memakai env `SEED_PASSWORD`, dan tombol akun demo di halaman login disembunyikan. Opsional: `docker compose up -d` untuk Postgres + Redis sendiri, lalu isi `REDIS_URL` agar antrean memakai BullMQ.

## 3. Menguji pembayaran

### Lokal tanpa gateway (default `PAYMENT_PROVIDER="fake"`)
1. Login kasir → **Shift & Kas** → buka shift.
2. **Kasir** → pilih produk → **Bayar** → tab **QRIS (F8)** atau **Transfer VA**. QR/VA muncul dengan hitung mundur, status besar **MENUNGGU**.
3. Klik **Simulasi lunas (dev)** — ini membuat webhook bertanda tangan HMAC dan mengirimnya lewat jalur yang **sama persis** dengan webhook asli (`prosesWebhook`). Layar berubah **LUNAS**, bunyi notifikasi, struk terbit & dicetak — tanpa kasir mengklik "lunas".
4. **Simulasi expire (dev)** → status **KEDALUWARSA**, order tetap belum bayar, tombol **Buat QR Baru**.

Kirim webhook manual (mis. untuk uji duplikat):

```bash
BODY='{"eventId":"evt_1","providerRef":"<providerRef>","orderId":"<orderNo>","status":"settlement","amount":92000,"method":"QRIS"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "fake-secret-dev" | cut -d' ' -f2)
curl -X POST localhost:3000/api/webhooks/fake -H "x-fake-signature: $SIG" -d "$BODY"   # kirim 2x → kedua: {"duplicate":true}
```

### Midtrans sandbox
1. `.env`: `PAYMENT_PROVIDER="midtrans"`, `MIDTRANS_SERVER_KEY="SB-Mid-server-..."`.
2. Dashboard Midtrans → Settings → Payment → **Notification URL**: `https://<domain>/api/webhooks/midtrans` (lokal: pakai tunnel seperti ngrok/cloudflared).
3. Bayar QR dengan simulator sandbox Midtrans. Signature diverifikasi `SHA512(order_id + status_code + gross_amount + server_key)`.

QRIS/VA dianggap lunas **hanya** dari webhook terverifikasi (atau rekonsiliasi server-ke-gateway tiap 5 menit). Klik kasir tidak pernah menandai lunas.

### Transfer bank manual (tanpa gateway — sudah bisa dipakai)
Isi rekening toko di **Pengaturan → Rekening transfer bank**. Di layar bayar pilih **Transfer Bank** → rekening tampil → kasir foto bukti (dikompres di browser) → status MENUNGGU → **Owner/Manager** cek mutasi lalu **Setujui** (di layar bayar atau menu **Pesanan**) → LUNAS + struk. Tidak pernah otomatis lunas.

## 4. Print agent (printer thermal)

Browser tidak bisa mengakses printer USB/ESC-POS langsung, jadi ada program kecil di komputer kasir:

```bash
# di komputer kasir (folder project yang sama)
PRINT_AGENT_TOKEN=rahasia PRINTER_TARGET="tcp://192.168.1.50:9100" npm run print-agent
```

Lalu di server set `PRINT_MODE="agent"`, `PRINT_AGENT_URL="http://localhost:9100"`, `PRINT_AGENT_TOKEN=rahasia`. Target lain: share Windows `\\localhost\XP58`, Linux `/dev/usb/lp0`, atau `stdout` untuk tes. Detail instalasi sebagai service (pm2/nssm) & alternatif QZ Tray: [print-agent/README.md](print-agent/README.md).

Kertas 58mm (32 karakter) atau 80mm (48 karakter) diatur di **Pengaturan → Template struk**. Printer mati → print job `FAILED`, struk & nomornya tetap tersimpan, cetak ulang dari menu **Struk** (berlabel `*** REPRINT ***`, tercatat di audit log).

## 5. Testing

```bash
npm test        # Vitest: kalkulasi uang, format struk, webhook (idempotensi, signature, nominal beda,
                # out-of-order, orphan) terhadap SQLite terpisah prisma/data/test.db, adapter Midtrans, CSV, ESC/POS
npm run e2e     # Playwright: login → buka shift → order 2 Caffe Latte + 1 Croissant meja 04 = Rp92.000
                # → bayar cash Rp100.000 (kembali Rp8.000) → struk CRB-YYYYMMDD-NNNN → order QRIS → simulasi
                # settlement → PAID + struk. Butuh Google Chrome terpasang; dev server dijalankan otomatis.
```

## 6. Variabel environment

| Variabel | Wajib | Default | Keterangan |
|---|---|---|---|
| `DATABASE_URL` | ya | `file:./data/kasirku.db` | SQLite (relatif ke `prisma/`) atau URL Postgres |
| `APP_URL` | prod | `http://localhost:3000` | Dipakai untuk link/QR struk digital di kertas |
| `SESSION_SECRET` | prod | (dev fallback) | Kunci tanda tangan JWT sesi, ≥ 32 karakter |
| `SESSION_IDLE_MINUTES` | — | `30` | Auto-logout saat idle |
| `PAYMENT_PROVIDER` | — | `fake` | `fake` (mode demo, ada tombol simulasi) atau `midtrans` |
| `SEED_PASSWORD` | online | — | Password awal semua akun saat seed di Postgres (min 8 karakter) |
| `PAYMENT_FAKE_SECRET` | — | `fake-secret-dev` | HMAC webhook provider fake |
| `MIDTRANS_SERVER_KEY` | midtrans | — | Server key sandbox/production |
| `MIDTRANS_CLIENT_KEY` | — | — | Disimpan untuk integrasi Snap di masa depan |
| `MIDTRANS_IS_PRODUCTION` | — | `false` | `true` = api.midtrans.com |
| `REDIS_URL` | prod | kosong | Kosong = queue in-memory (job hilang saat restart) |
| `PRINT_MODE` | — | `simulate` | `none` (belum ada printer, struk dicetak dari browser), `simulate`, atau `agent` |
| `PRINT_AGENT_URL` | agent | `http://localhost:9100` | Alamat print agent |
| `PRINT_AGENT_TOKEN` | agent | — | Token bersama server ↔ print agent |
| `PRINTER_TARGET` | — | `stdout` | Dibaca print agent: `tcp://ip:port`, path device/share |
| `PRINT_AGENT_HOST` / `PRINT_AGENT_PORT` | — | `127.0.0.1` / `9100` | Bind print agent |
| `NEXT_PUBLIC_SW` | — | kosong | `1` = aktifkan service worker saat dev |

## 7. Halaman & shortcut

Login (email / PIN) · Dashboard · Kasir (POS) · Pesanan · Meja · Dapur (KDS) · Produk · Stok · Shift & Kas · Struk · Laporan · Pengguna · Audit Log · Pengaturan · Struk digital publik `/r/<token>`.

Kasir: `F2` cari/scan barcode · `F4` bayar cash · `F8` bayar QRIS · `Enter` konfirmasi bayar · `Esc` tutup modal. Nominal cepat: uang pas, 50rb, 100rb, 150rb, 200rb.

## 8. Asumsi & keputusan teknis

Diambil dengan prinsip "paling aman untuk uang, paling sederhana untuk kasir":

1. **SQLite untuk dev lokal, Postgres untuk online** — dipilih otomatis dari `DATABASE_URL`, sudah diuji end-to-end di keduanya (E2E + alur DoD). Semua uang `Int` rupiah.
2. **Sesi memakai JWT (jose) + cookie httpOnly**, bukan Auth.js: kebutuhannya hanya email/password + PIN + RBAC per outlet, tanpa OAuth. Hash bcrypt cost 12. Rate limit login 5x/15 menit per IP dan per akun (in-memory; pindah ke Redis kalau multi-instance).
3. **Komponen UI sendiri** (`src/components/ui.tsx`) bergaya neumorphism, bukan shadcn/ui, supaya tema gelap-ungu konsisten tanpa menimpa styling pihak ketiga.
4. **Struk dibuat di transaksi yang sama dengan pelunasan** (bukan job `receipt.generate` terpisah) supaya tidak ada order PAID tanpa struk dan nomor struk tidak bolong. Pencetakan tetap lewat queue (`receipt.print`) dengan retry 5x + exponential backoff.
5. **Pembulatan** dapat diatur per outlet: kelipatan (0/100/500/1000) dan arah (terdekat/ke atas/ke bawah). Seed outlet kafe memakai PB1 10% + service 5% + pembulatan **ke atas 1.000** agar contoh struk PRD (subtotal 79.000 → pembulatan 755 → total 92.000) persis; outlet resto pakai terdekat 100; minimarket PPN 11% inclusive.
6. **Harga modifier per unit**: Extra Shot Caffe Latte Rp4.000/cup sehingga 2 cup = +Rp8.000 di struk (sesuai contoh PRD).
7. **Refund oleh kasir** butuh persetujuan Manager/Owner via email + PIN di form yang sama; Owner/Manager boleh langsung. Stok kembali hanya pada refund penuh. Struk refund terbit terpisah dengan nominal yang dikembalikan; struk asli tidak berubah.
8. **Offline**: hanya order cash yang diantrekan di IndexedDB. Saat offline kasir mendapat **struk sementara** (tanpa nomor resmi); saat online order disinkronkan secara idempotent (`clientRef`) dan **struk resmi bernomor** terbit & dicetak otomatis. QRIS/VA dinonaktifkan dengan pesan jelas.
9. **Webhook Midtrans**: `order_id` yang dikirim ke Midtrans diberi suffix `~xxxx` supaya regenerate QR tidak ditolak (Midtrans mewajibkan order_id unik); suffix dibuang saat webhook diproses. Matching wajib `transaction_id` **dan** nomor order.
10. **Notifikasi** (nominal webhook tidak cocok, dll.) untuk saat ini: penanda `needsReview` di dashboard & menu Pesanan + log server. Integrasi WhatsApp/email masuk fase 2.
11. Rekonsiliasi berjalan sebagai interval di proses web (cukup untuk satu instance). Multi-instance: jadikan BullMQ repeatable job.
12. Xendit/DOKU belum diimplementasikan; tinggal menambah adapter baru yang memenuhi interface `PaymentProvider` di `src/lib/payments/`.
