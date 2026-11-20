"use client";

import Dexie, { type Table } from "dexie";
import { api } from "@/lib/client";

/**
 * Antrean order cash saat offline (PRD §10.2). Disimpan di IndexedDB lalu dikirim ke
 * /api/orders/sync saat online. clientRef (UUID) membuat sinkronisasi idempotent.
 * QRIS/VA tidak pernah diantrekan: butuh gateway.
 */
export type OrderOffline = {
  clientRef: string;
  type: "DINE_IN" | "TAKEAWAY" | "WALK_IN";
  tableId: string | null;
  amountReceived: number;
  grandTotal: number; // perkiraan lokal; server menghitung ulang
  items: { productId: string; variantId: string | null; qty: number; modifierIds: string[]; note: string | null }[];
  createdAt: string;
  status: "PENDING" | "FAILED";
  error?: string;
};

class DbOffline extends Dexie {
  orders!: Table<OrderOffline, string>;
  constructor() {
    super("kasirku-offline");
    this.version(1).stores({ orders: "clientRef, status, createdAt" });
  }
}

let db: DbOffline | null = null;
const dbOffline = () => (db ??= new DbOffline());

export async function antreOrder(o: Omit<OrderOffline, "status" | "createdAt">) {
  await dbOffline().orders.put({ ...o, status: "PENDING", createdAt: new Date().toISOString() });
}

export async function jumlahAntrean(): Promise<number> {
  return dbOffline().orders.count();
}

let sedangSync = false;

/** Kirim semua antrean. Yang sukses dihapus, yang ditolak server ditandai FAILED (tetap tersimpan). */
export async function sinkronAntrean(): Promise<{ sukses: number; gagal: number }> {
  if (sedangSync || !navigator.onLine) return { sukses: 0, gagal: 0 };
  sedangSync = true;
  let sukses = 0;
  let gagal = 0;
  try {
    const semua = await dbOffline().orders.orderBy("createdAt").toArray();
    for (const o of semua) {
      try {
        await api("/api/orders/sync", {
          method: "POST",
          body: JSON.stringify({
            clientRef: o.clientRef,
            type: o.type,
            tableId: o.tableId,
            amountReceived: o.amountReceived,
            items: o.items,
          }),
        });
        await dbOffline().orders.delete(o.clientRef);
        sukses++;
      } catch (err) {
        if (!navigator.onLine) break; // putus lagi: coba nanti
        await dbOffline().orders.update(o.clientRef, {
          status: "FAILED",
          error: err instanceof Error ? err.message : "Gagal sinkron",
        });
        gagal++;
      }
    }
  } finally {
    sedangSync = false;
  }
  return { sukses, gagal };
}
