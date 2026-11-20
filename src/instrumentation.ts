/**
 * Instrumentation hook Next.js: dijalankan sekali saat server start.
 * Dipakai untuk memasang worker cetak struk.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { pasangWorkerCetak } = await import("@/lib/print-worker");
    pasangWorkerCetak();
    const { jadwalkanRekonsiliasi } = await import("@/lib/reconcile");
    jadwalkanRekonsiliasi();
  }
}
