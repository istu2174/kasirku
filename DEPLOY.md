# Deploy KasirKu Online (Gratis): GitHub → Render + Neon

Hasil akhirnya: aplikasi bisa dibuka dari HP/tablet/laptop mana pun lewat alamat seperti `https://kasirku-xxxx.onrender.com`.

| Bagian | Layanan | Biaya | Catatan |
|---|---|---|---|
| Kode | GitHub | Gratis | Setiap `git push` → otomatis deploy ulang |
| Aplikasi | Render (Free Web Service) | Gratis | Tidur setelah 15 menit tanpa akses, bangun lagi ±1 menit |
| Database | Neon (Free) | Gratis, tanpa batas waktu | 1 GB data, 100 jam compute/bulan, tidur otomatis saat sepi |

> Kenapa bukan database Render? Postgres gratis Render dihapus setelah 30 hari. Neon tidak.

---

## Langkah 1 — Buat database di Neon (±3 menit)

1. Buka **https://neon.com** → **Sign up** (paling gampang pakai akun GitHub).
2. **Create project**:
   - Project name: `kasirku`
   - Postgres version: biarkan default
   - Region: **AWS Asia Pacific (Singapore)** (paling dekat ke Indonesia)
3. Setelah jadi, klik **Connect** di dashboard project.
4. **Matikan** opsi **Connection pooling** (aplikasi ini butuh koneksi langsung).
5. Salin **connection string**, bentuknya:
   ```
   postgresql://neondb_owner:xxxxxxxx@ep-xxxx-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
   Simpan baik-baik — ini kunci database kamu, **jangan dibagikan**.

## Langkah 2 — Kode ada di GitHub

Repo GitHub harus sudah berisi kode ini (Claude bisa membuatkannya, atau manual):

```bash
git remote add origin https://github.com/<username>/kasirku.git
git push -u origin main
```

File `.env` dan database lokal **tidak ikut** ter-upload (sudah diatur di `.gitignore`).

## Langkah 3 — Deploy di Render (±10 menit, sebagian besar menunggu build)

1. Buka **https://render.com** → **Get Started** → daftar pakai **GitHub**.
2. Izinkan Render mengakses repo `kasirku`.
3. Di dashboard: **New +** → **Blueprint**.
4. Pilih repo `kasirku` → Render membaca file `render.yaml` otomatis.
5. Render meminta isi **DATABASE_URL** → tempel connection string Neon dari Langkah 1.
6. Klik **Apply** / **Deploy Blueprint**.
7. Tunggu build selesai (5–10 menit pertama kali). Status berubah jadi **Live**.
8. Alamat aplikasi ada di bagian atas halaman service, misalnya `https://kasirku-ab12.onrender.com`.

Yang dibuat otomatis oleh `render.yaml`:
- `SESSION_SECRET`, `PAYMENT_FAKE_SECRET` → acak, aman.
- `SEED_PASSWORD` → password awal semua akun (acak).
- `PAYMENT_PROVIDER=fake` → QRIS/VA masih **mode demo**.
- `PRINT_MODE=none` → belum pakai printer thermal; struk tampil di layar & bisa dicetak/PDF dari browser.

## Langkah 4 — Login pertama & amankan akun

1. Di Render → service **kasirku** → tab **Environment** → cari `SEED_PASSWORD` → klik ikon mata untuk melihat.
2. Buka alamat aplikasi → login **owner@kasirku.id** dengan password itu.
3. Menu **Pengguna** → untuk setiap akun klik **Sandi** (ganti password) dan **PIN** (ganti PIN).
   Akun awal: `owner@`, `manager@`, `kasir@`, `dapur@`, `gudang@kasirku.id` — semua memakai `SEED_PASSWORD` sampai diganti.
   PIN awal: owner `0000`, manager `5678`, kasir `1234`.
4. Akun yang tidak dipakai: ubah status jadi **SUSPENDED**.

## Langkah 5 — Isi data toko

- **Pengaturan** → nama/alamat/telepon outlet, pajak & service, footer struk, dan **Rekening transfer bank** (dipakai di layar bayar "Transfer Bank").
- **Produk** → ubah/nonaktifkan produk contoh, tambah produk sendiri (atau Import CSV).
- **Stok** → sesuaikan stok awal.
- Ganti outlet lewat dropdown di sidebar (contoh: Coffee, Resto, Mart). Outlet yang tidak dipakai cukup diabaikan.

## Cara pakai pembayaran sekarang (sebelum Midtrans)

| Metode | Status sekarang |
|---|---|
| **Cash** | Jalan penuh. Konfirmasi kasir → LUNAS → struk otomatis. |
| **Transfer Bank** | Jalan penuh tanpa gateway: layar menampilkan rekening toko → kasir foto bukti transfer → Owner/Manager cek mutasi rekening lalu **Setujui** (langsung di layar bayar atau di menu Pesanan) → LUNAS → struk. |
| **QRIS / Virtual Account** | **Mode demo**: QR & nomor VA dibuat, tapi **bukan pembayaran asli**. Pakai tombol "Simulasi lunas (demo)" untuk mencoba alurnya. Jangan minta pelanggan scan QR ini. Akan jadi asli setelah disambung ke Midtrans. |

## Struk

- Terbit otomatis setelah LUNAS, nomor urut `CRB-YYYYMMDD-0001`.
- Tombol **Cetak / PDF** → dialog print browser: bisa ke printer biasa atau **Save as PDF**.
- **Struk digital**: link/QR `/r/...` bisa dikirim ke pelanggan (berlaku 30 hari).
- Printer thermal + print agent bisa dipasang nanti (lihat `print-agent/README.md`), cukup ubah `PRINT_MODE` di Render.

## Update aplikasi

Setiap perubahan yang di-`git push` ke branch `main` otomatis di-deploy ulang oleh Render. Struktur database ikut diperbarui otomatis saat start (`prisma db push`), dan **data tidak dihapus** — kalau ada perubahan yang berisiko menghapus data, deploy berhenti dengan error alih-alih menghapus.

## Batasan versi gratis (penting diketahui)

- **Render tidur** setelah 15 menit tanpa akses → buka pertama kali butuh ±1 menit. Buka aplikasi beberapa menit sebelum toko buka.
  Opsional: pasang monitor gratis (mis. UptimeRobot) yang mengakses `https://<alamat>/api/health` tiap 10 menit selama jam buka supaya tidak tidur. Endpoint ini tidak menyentuh database, jadi tidak menghabiskan kuota Neon.
- **Neon**: 1 GB data (cukup untuk puluhan ribu transaksi) dan 100 jam compute/bulan. Database tidur sendiri setelah 5 menit sepi, jadi untuk toko kecil biasanya cukup. Pantau di dashboard Neon → Usage.
- Antrean tugas memakai memori (tanpa Redis). Aman untuk 1 server; tugas cetak yang belum selesai bisa hilang saat server restart (struknya tetap tersimpan, tinggal cetak ulang).

## Kalau ada masalah

| Gejala | Solusi |
|---|---|
| Deploy gagal: `Set env SEED_PASSWORD` | Pastikan env `SEED_PASSWORD` ada (min 8 karakter) di tab Environment. |
| Deploy gagal: `Can't reach database server` | Cek `DATABASE_URL` (harus diakhiri `?sslmode=require`), dan connection pooling Neon dimatikan. |
| Login selalu gagal | Password = nilai `SEED_PASSWORD` (bukan `owner123`). Terlalu banyak salah → tunggu 15 menit. |
| Halaman lama sekali dibuka | Server sedang bangun dari tidur (±1 menit). |
| Lihat log error | Render → service kasirku → tab **Logs**. |
