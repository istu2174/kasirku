/** Parser & penulis CSV sederhana (RFC 4180): field ber-quote, "" sebagai kutip, koma/newline di dalam quote. */

export function parseCsv(teks: string): string[][] {
  const baris: string[][] = [];
  let kolom: string[] = [];
  let sel = "";
  let dalamQuote = false;
  const s = teks.charCodeAt(0) === 0xfeff ? teks.slice(1) : teks; // buang BOM Excel

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (dalamQuote) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          sel += '"';
          i++;
        } else {
          dalamQuote = false;
        }
      } else {
        sel += c;
      }
    } else if (c === '"') {
      dalamQuote = true;
    } else if (c === ",") {
      kolom.push(sel);
      sel = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      kolom.push(sel);
      baris.push(kolom);
      kolom = [];
      sel = "";
    } else {
      sel += c;
    }
  }
  if (dalamQuote) throw new Error("CSV tidak valid: tanda kutip tidak ditutup");
  if (sel !== "" || kolom.length > 0) {
    kolom.push(sel);
    baris.push(kolom);
  }
  // Abaikan baris kosong (mis. baris terakhir).
  return baris.filter((b) => b.some((v) => v.trim() !== ""));
}

/** Baris pertama = header (huruf kecil, di-trim). Hasil: objek per baris data. */
export function csvKeObjek(teks: string): Record<string, string>[] {
  const [header, ...data] = parseCsv(teks);
  if (!header) return [];
  const kunci = header.map((h) => h.trim().toLowerCase());
  return data.map((b) => Object.fromEntries(kunci.map((k, i) => [k, (b[i] ?? "").trim()])));
}

function selCsv(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v !== "string") return String(v);
  // Cegah formula injection saat dibuka di spreadsheet.
  const aman = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(aman) ? `"${aman.replace(/"/g, '""')}"` : aman;
}

export function keCsv(header: string[], baris: (string | number | boolean | null | undefined)[][]): string {
  return [header, ...baris].map((b) => b.map(selCsv).join(",")).join("\r\n") + "\r\n";
}
