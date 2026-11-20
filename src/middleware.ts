import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify, SignJWT } from "jose";

const SESSION_COOKIE = "kasirku_session";

const PUBLIK = [
  "/login",
  "/api/auth/login",
  "/api/auth/pin",
  "/api/webhooks",
  "/api/health",
  "/r/", // struk digital publik (token acak)
  "/api/public/", // API struk digital publik (token acak)
];

function secret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.SESSION_SECRET || "kasirku-dev-secret-minimal-32-karakter-ok",
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIK.some((p) => pathname === p || pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icon") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Belum login" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  try {
    const { payload } = await jwtVerify(token, secret());
    // Sliding idle: perpanjang masa sesi setiap ada aktivitas.
    const minutes = Number(process.env.SESSION_IDLE_MINUTES ?? 30);
    const baru = await new SignJWT({ ...payload })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${minutes}m`)
      .sign(secret());

    const res = NextResponse.next();
    res.cookies.set(SESSION_COOKIE, baru, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: minutes * 60,
    });
    return res;
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sesi kedaluwarsa" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
