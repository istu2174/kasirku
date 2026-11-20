/** Encoder ESC/POS minimal untuk printer thermal 58/80mm (Epson-compatible). */

const ESC = 0x1b;
const GS = 0x1d;

/** Teks → byte ASCII (subset CP437). Karakter di luar ASCII cetak diganti "?". */
export function keAscii(teks: string): Buffer {
  const bersih = teks
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // buang diakritik: é → e
    .replace(/\r\n?/g, "\n")
    .replace(/[^\n\x20-\x7e]/g, "?");
  return Buffer.from(bersih, "ascii");
}

/** QR model 2 lewat GS ( k: pilih model, ukuran modul, koreksi error M, simpan data, cetak. */
export function perintahQr(data: string, ukuranModul = 6): Buffer {
  const isi = keAscii(data);
  const panjang = isi.length + 3;
  return Buffer.concat([
    Buffer.from([ESC, 0x61, 1]), // rata tengah
    Buffer.from([GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0]), // model 2
    Buffer.from([GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, ukuranModul]),
    Buffer.from([GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31]), // error correction M
    Buffer.from([GS, 0x28, 0x6b, panjang & 0xff, panjang >> 8, 0x31, 0x50, 0x30]),
    isi,
    Buffer.from([GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30]), // cetak simbol
    Buffer.from([0x0a, ESC, 0x61, 0]), // kembali rata kiri
  ]);
}

export type IsiCetak = { text: string; width: 32 | 48; qr?: string; cut?: boolean };

export function keEscPos(isi: IsiCetak): Buffer {
  // 58mm (32 kolom) pakai modul QR lebih kecil supaya muat.
  const modul = isi.width === 48 ? 6 : 5;
  return Buffer.concat([
    Buffer.from([ESC, 0x40]), // init
    keAscii(isi.text.endsWith("\n") ? isi.text : `${isi.text}\n`),
    isi.qr ? perintahQr(isi.qr, modul) : Buffer.alloc(0),
    Buffer.from([ESC, 0x64, 4]), // feed 4 baris
    isi.cut ? Buffer.from([GS, 0x56, 66, 0]) : Buffer.alloc(0), // partial cut dengan feed
  ]);
}
