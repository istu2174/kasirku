# Print agent lokal KasirKu

Program Node kecil yang jalan di komputer kasir. Server KasirKu (worker `receipt.print`, `src/lib/print-worker.ts`) mengirim struk ke agent ini, lalu agent meneruskannya ke printer thermal sebagai byte ESC/POS. Tidak butuh dependency tambahan.

## API

| Method | Path | Keterangan |
|---|---|---|
| `GET` | `/health` | `{"ok":true,"target":"stdout|tcp|device"}` |
| `POST` | `/print` | Header `x-agent-token: <PRINT_AGENT_TOKEN>`, body `{ "text": string, "width": 32 \| 48, "qr"?: string, "cut"?: boolean }` |

Balasan: `200` tercetak, `401` token salah, `400` body tidak valid, `502` printer gagal (server menandai print job `FAILED` lalu retry sampai 5 kali; struk tetap bisa dicetak ulang dari menu Struk).

Isi yang dikirim ke printer: `ESC @` (init) → teks ASCII (karakter non-ASCII jadi `?`) → QR model 2 (`GS ( k`) berisi link struk digital → feed 4 baris → potong (`GS V 66 0`).

CORS hanya untuk origin `localhost` / `127.0.0.1`. Agent hanya listen di `127.0.0.1` kecuali `PRINT_AGENT_HOST` diubah.

## Konfigurasi (env)

| Variabel | Default | Contoh |
|---|---|---|
| `PRINT_AGENT_TOKEN` | — (wajib) | sama dengan `PRINT_AGENT_TOKEN` di server |
| `PRINTER_TARGET` | `stdout` | `tcp://192.168.1.50:9100`, `\\localhost\XP58`, `/dev/usb/lp0` |
| `PRINT_AGENT_PORT` | `9100` | `9100` |
| `PRINT_AGENT_HOST` | `127.0.0.1` | `0.0.0.0` kalau server KasirKu jalan di komputer lain dalam LAN |

Agent membaca `.env` di folder kerja kalau ada (`process.loadEnvFile`, Node ≥ 20.12).

Di server KasirKu set:

```env
PRINT_MODE="agent"
PRINT_AGENT_URL="http://localhost:9100"
PRINT_AGENT_TOKEN="token-yang-sama"
```

Catatan: port default agent (9100) sama dengan port raw printer jaringan. Kalau agent dan printer jaringan ada di mesin berbeda, tidak masalah. Kalau bentrok, ganti `PRINT_AGENT_PORT` dan `PRINT_AGENT_URL`.

## Menjalankan

```bash
npm run print-agent            # = tsx print-agent/index.ts
```

Uji tanpa printer (`PRINTER_TARGET=stdout`, struk tampil di console):

```bash
curl -X POST http://localhost:9100/print \
  -H "x-agent-token: dev-token" -H "Content-Type: application/json" \
  -d '{"text":"TES PRINTER\nTOTAL Rp92.000","width":32,"qr":"http://localhost:3000","cut":true}'
```

## Windows: printer USB lewat share

1. Pasang driver printer (atau driver "Generic / Text Only").
2. Control Panel → Devices and Printers → klik kanan printer → **Printer properties** → tab **Sharing** → centang *Share this printer*, beri nama pendek, mis. `XP58`.
3. Set `PRINTER_TARGET=\\localhost\XP58` (di file `.env` tulis apa adanya: `PRINTER_TARGET="\\localhost\XP58"`).
4. Tes: `npm run print-agent`, lalu kirim curl di atas.

Printer jaringan (LAN/Wi-Fi) cukup `PRINTER_TARGET=tcp://IP-PRINTER:9100`.

### Jalan otomatis sebagai service (NSSM)

```powershell
nssm install KasirKuPrintAgent "C:\Program Files\nodejs\npx.cmd" "tsx print-agent/index.ts"
nssm set KasirKuPrintAgent AppDirectory "C:\kasirku"
nssm set KasirKuPrintAgent AppEnvironmentExtra PRINT_AGENT_TOKEN=token-rahasia PRINTER_TARGET=\\localhost\XP58
nssm start KasirKuPrintAgent
```

Service NSSM berjalan sebagai *LocalSystem*; kalau share printer tidak terbaca, ubah akun service ke user Windows kasir (`nssm set KasirKuPrintAgent ObjectName .\kasir password`).

## Linux: printer USB

1. Colok printer, cek device: `ls /dev/usb/lp*` (biasanya `/dev/usb/lp0`).
2. Beri akses ke user yang menjalankan agent: `sudo usermod -aG lp $USER` lalu logout/login.
3. `PRINTER_TARGET=/dev/usb/lp0 PRINT_AGENT_TOKEN=token-rahasia npm run print-agent`.

### Jalan otomatis (pm2, Windows/Linux)

```bash
npm i -g pm2
PRINT_AGENT_TOKEN=token-rahasia PRINTER_TARGET=/dev/usb/lp0 pm2 start "npx tsx print-agent/index.ts" --name kasirku-print
pm2 save
pm2 startup        # ikuti perintah yang dicetak agar hidup lagi setelah reboot
```

## Alternatif: QZ Tray

Kalau tidak mau memasang Node di komputer kasir, [QZ Tray](https://qz.io) bisa mencetak raw ESC/POS langsung dari browser lewat WebSocket. Alurnya: browser mengambil teks struk (`GET /api/receipts/[id]`), lalu memanggil `qz.print(config, [{ type: "raw", format: "plain", data: teks }])`. Kekurangannya: QZ Tray butuh sertifikat bertanda tangan agar tidak muncul dialog izin di setiap cetak, dan integrasinya belum dibuat di KasirKu (agent ini yang dipakai `print-worker`).
