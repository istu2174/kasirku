import { z } from "zod";
import { bacaJson, ok, route } from "@/lib/api";
import { konteks } from "@/lib/session-context";
import { sinkronOrderOffline } from "@/lib/order-service";

/** Terima order cash dari antrean offline (IndexedDB) saat perangkat online lagi. */
const skema = z.object({
  clientRef: z.string().uuid(),
  type: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY", "WALK_IN"]),
  tableId: z.string().nullable().optional(),
  note: z.string().max(300).nullable().optional(),
  amountReceived: z.number().int().nonnegative(),
  items: z
    .array(
      z.object({
        productId: z.string(),
        variantId: z.string().nullable().optional(),
        qty: z.number().int().positive(),
        modifierIds: z.array(z.string()).default([]),
        note: z.string().max(200).nullable().optional(),
      }),
    )
    .min(1),
});

export const POST = route(async (req) => {
  const { sesi, outlet } = await konteks("order.create");
  const body = skema.parse(await bacaJson(req));
  const hasil = await sinkronOrderOffline({ outletId: outlet.id, userId: sesi.userId }, body);
  return ok(hasil);
});
