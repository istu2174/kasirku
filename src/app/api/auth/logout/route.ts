import { ok, route } from "@/lib/api";
import { hapusSessionCookie } from "@/lib/auth";

export const POST = route(async () => {
  await hapusSessionCookie();
  return ok({ ok: true });
});
