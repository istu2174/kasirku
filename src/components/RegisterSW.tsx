"use client";

import { useEffect } from "react";

/** Daftarkan service worker PWA (production, atau dev dengan NEXT_PUBLIC_SW=1). */
export function RegisterSW() {
  useEffect(() => {
    const aktif = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_SW === "1";
    if (!aktif || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err: unknown) => {
      console.warn("[sw] gagal mendaftar", err);
    });
  }, []);
  return null;
}
