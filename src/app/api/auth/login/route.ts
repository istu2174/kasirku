import { z } from "zod";
import { bacaJson, ok, route } from "@/lib/api";
import { cekRateLimit, loginEmail, resetRateLimit, setDeviceCookie, setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";

const skema = z.object({
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(1, "Password wajib diisi"),
});

export const POST = route(async (req) => {
  const { email, password } = skema.parse(await bacaJson(req));
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const kunci = [`ip:${ip}`, `akun:${email.toLowerCase()}`];
  cekRateLimit(...kunci);

  const sesi = await loginEmail(email, password);
  resetRateLimit(...kunci); // yang dihitung hanya percobaan gagal
  await setSessionCookie(sesi);
  await setDeviceCookie(sesi.outletId);

  const outlet = await prisma.outlet.findUnique({ where: { id: sesi.outletId } });
  return ok({
    user: { id: sesi.userId, name: sesi.name, email: sesi.email, role: sesi.role },
    outlet,
  });
});
