import { ok, route } from "@/lib/api";

export const GET = route(async () => ok({ status: "ok", waktu: new Date().toISOString() }));
