import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "@/lib/rbac";

export type Ctx<T> = { params: Promise<T> };

/** Bungkus route handler: error jadi JSON rapi, bukan stack trace. */
export function route<P = Record<string, string>>(fn: (req: Request, ctx: Ctx<P>) => Promise<Response>) {
  return async (req: Request, ctx: Ctx<P>): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: "Input tidak valid", detail: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
          { status: 400 },
        );
      }
      const pesan = err instanceof Error ? err.message : "Terjadi kesalahan";
      console.error("[api]", pesan);
      return NextResponse.json({ error: pesan }, { status: 500 });
    }
  };
}

export const ok = <T>(data: T, status = 200) => NextResponse.json(data, { status });

export async function bacaJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Body JSON tidak valid");
  }
}
