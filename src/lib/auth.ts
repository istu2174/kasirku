import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { can, HttpError, type Role } from "@/lib/rbac";

export const SESSION_COOKIE = "kasirku_session";
/** Outlet terakhir di perangkat ini, dipakai untuk login cepat dengan PIN (bukan rahasia). */
export const DEVICE_COOKIE = "kasirku_device";

export type SessionData = {
  userId: string;
  tenantId: string;
  outletId: string;
  role: Role;
  name: string;
  email: string;
};

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET || "kasirku-dev-secret-minimal-32-karakter-ok";
  return new TextEncoder().encode(value);
}

function idleMinutes(): number {
  const n = Number(process.env.SESSION_IDLE_MINUTES ?? 30);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

export async function buatToken(data: SessionData): Promise<string> {
  return new SignJWT({ ...data })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${idleMinutes()}m`)
    .sign(secret());
}

export async function bacaToken(token: string): Promise<SessionData | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.userId || !payload.outletId || !payload.role) return null;
    return {
      userId: String(payload.userId),
      tenantId: String(payload.tenantId),
      outletId: String(payload.outletId),
      role: payload.role as Role,
      name: String(payload.name ?? ""),
      email: String(payload.email ?? ""),
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(data: SessionData) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await buatToken(data), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: idleMinutes() * 60,
  });
}

export async function setDeviceCookie(outletId: string) {
  const jar = await cookies();
  jar.set(DEVICE_COOKIE, outletId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 24 * 3600,
  });
}

export async function bacaDeviceOutlet(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(DEVICE_COOKIE)?.value ?? null;
}

/** Susun sesi untuk user di outlet tertentu; 403 kalau tidak ditugaskan di sana. */
export async function sesiUntukOutlet(userId: string, outletId: string): Promise<SessionData> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { outlets: { where: { outletId } } },
  });
  if (!user || user.status !== "ACTIVE") throw new HttpError(401, "User tidak aktif");
  const akses = user.outlets[0];
  if (!akses) throw new HttpError(403, "User tidak ditugaskan di outlet ini");
  return {
    userId: user.id,
    tenantId: user.tenantId,
    outletId,
    role: akses.role as Role,
    name: user.name,
    email: user.email,
  };
}

// Rate limit in-memory: 5 percobaan / 15 menit per kunci (IP dan akun dihitung terpisah).
// shortcut: hilang saat restart & tidak berbagi antar instance; pindah ke Redis saat multi-instance.
const percobaan = new Map<string, { jumlah: number; sampai: number }>();

export function cekRateLimit(...kunci: string[]) {
  const sekarang = Date.now();
  for (const k of kunci) {
    const data = percobaan.get(k);
    if (data && data.sampai > sekarang && data.jumlah >= 5) {
      throw new HttpError(429, "Terlalu banyak percobaan. Coba lagi dalam 15 menit.");
    }
  }
  for (const k of kunci) {
    const data = percobaan.get(k);
    if (!data || data.sampai < sekarang) percobaan.set(k, { jumlah: 1, sampai: sekarang + 15 * 60_000 });
    else data.jumlah += 1;
  }
}

export function resetRateLimit(...kunci: string[]) {
  for (const k of kunci) percobaan.delete(k);
}

export async function hapusSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Baca sesi aktif. null kalau belum login / token kedaluwarsa. */
export async function getSession(): Promise<SessionData | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return bacaToken(token);
}

/** Untuk route API: sesi wajib ada. */
export async function wajibLogin(): Promise<SessionData> {
  const sesi = await getSession();
  if (!sesi) throw new HttpError(401, "Sesi habis, silakan login lagi");
  return sesi;
}

/** Login email + password. PIN dipakai untuk buka kunci layar kasir. */
export async function loginEmail(email: string, password: string): Promise<SessionData> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { outlets: { include: { outlet: true }, orderBy: { outlet: { createdAt: "asc" } } } },
  });
  if (!user || user.status !== "ACTIVE") throw new HttpError(401, "Email atau password salah");

  const cocok = await bcrypt.compare(password, user.passwordHash);
  if (!cocok) throw new HttpError(401, "Email atau password salah");

  // Outlet terakhir di perangkat ini kalau user ditugaskan di sana; selain itu outlet pertama.
  const terakhir = await bacaDeviceOutlet();
  const penugasan = user.outlets.find((o) => o.outletId === terakhir) ?? user.outlets[0];
  if (!penugasan) throw new HttpError(403, "User belum ditugaskan ke outlet mana pun");

  return {
    userId: user.id,
    tenantId: user.tenantId,
    outletId: penugasan.outletId,
    role: penugasan.role as Role,
    name: user.name,
    email: user.email,
  };
}

/** Verifikasi PIN 4–6 digit untuk user yang sudah login di outlet tertentu. */
export async function verifikasiPin(userId: string, pin: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.pinHash) return false;
  return bcrypt.compare(pin, user.pinHash);
}

export async function hashRahasia(teks: string): Promise<string> {
  return bcrypt.hash(teks, 12);
}

/** Pastikan user masih punya akses ke outlet di sesi (mis. setelah dicabut). */
export async function validasiAksesOutlet(sesi: SessionData): Promise<Role> {
  const akses = await prisma.userOutlet.findUnique({
    where: { userId_outletId: { userId: sesi.userId, outletId: sesi.outletId } },
  });
  if (!akses) throw new HttpError(403, "Akses ke outlet ini sudah dicabut");
  return akses.role as Role;
}

/**
 * Persetujuan Manager/Owner dengan email + PIN (refund, penyesuaian stok oleh staf).
 * Dibatasi 5 percobaan / 15 menit per email supaya PIN 4 digit tidak bisa ditebak.
 */
export async function verifikasiApprover(email: string, pin: string, outletId: string): Promise<string> {
  const kunci = `approve:${email.toLowerCase()}`;
  cekRateLimit(kunci);
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { outlets: { where: { outletId } } },
  });
  const peran = user?.outlets[0]?.role as Role | undefined;
  const pinCocok = user?.pinHash ? await bcrypt.compare(pin, user.pinHash) : false;
  if (!user || user.status !== "ACTIVE" || !pinCocok || !can(peran, "order.void")) {
    throw new HttpError(403, "Persetujuan ditolak: email/PIN salah atau bukan Manager");
  }
  resetRateLimit(kunci);
  return user.id;
}
