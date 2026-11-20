/** Format uang & tanggal sesuai lokal Indonesia (PRD §10.5). */

export const rupiah = (n: number) => "Rp" + new Intl.NumberFormat("id-ID").format(Math.round(n));

export const angka = (n: number) => new Intl.NumberFormat("id-ID").format(n);

const TZ = "Asia/Jakarta";

/** DD/MM/YYYY HH:mm (24 jam) di zona Asia/Jakarta, sesuai PRD §10.5. */
export function tanggalWaktu(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: TZ,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

export function tanggal(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TZ,
  }).format(date);
}

export function jam(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(date);
}

/** Kunci tanggal bisnis (YYYYMMDD) menurut timezone outlet, bukan UTC. */
export function dateKey(date: Date = new Date(), timeZone = TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}`;
}

/** Awal & akhir hari menurut timezone outlet (untuk laporan). */
export function rentangHari(timeZone = TZ, acuan: Date = new Date()) {
  const key = dateKey(acuan, timeZone); // YYYYMMDD
  const iso = `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}T00:00:00`;
  // WIB = UTC+7 (tanpa DST), cukup untuk Indonesia
  const offsetMenit = 7 * 60;
  const mulai = new Date(new Date(`${iso}Z`).getTime() - offsetMenit * 60_000);
  const selesai = new Date(mulai.getTime() + 24 * 60 * 60_000);
  return { mulai, selesai, key };
}
