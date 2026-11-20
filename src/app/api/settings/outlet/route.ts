import { z } from "zod";
import { bacaJson, ok, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { konteks } from "@/lib/session-context";
import { catatAudit } from "@/lib/audit";
import { parseTaxConfig } from "@/lib/money";

export const GET = route(async () => {
  const { outlet } = await konteks();
  const data = await prisma.outlet.findUniqueOrThrow({ where: { id: outlet.id } });
  return ok({
    outlet: {
      ...data,
      taxConfig: parseTaxConfig(data.taxConfig),
      receiptConfig: JSON.parse(data.receiptConfig),
    },
  });
});

const skema = z.object({
  name: z.string().trim().min(2).optional(),
  address: z.string().trim().min(5).optional(),
  phone: z.string().trim().min(5).optional(),
  taxConfig: z
    .object({
      taxName: z.string().trim().min(1).max(12).default("PB1"),
      taxPercent: z.number().min(0).max(100),
      taxInclusive: z.boolean(),
      servicePercent: z.number().min(0).max(100),
      roundingTo: z.union([z.literal(0), z.literal(100), z.literal(500), z.literal(1000)]),
      roundingMode: z.enum(["NEAREST", "UP", "DOWN"]).default("NEAREST"),
    })
    .optional(),
  receiptConfig: z
    .object({
      header: z.string().max(500).default(""),
      footer: z.string().max(500),
      paperWidth: z.union([z.literal(58), z.literal(80)]).default(58),
      bankName: z.string().trim().max(40).default(""),
      bankAccountNo: z.string().trim().regex(/^[0-9 -]*$/, "Nomor rekening hanya angka").max(30).default(""),
      bankAccountName: z.string().trim().max(60).default(""),
    })
    .optional(),
});

export const PATCH = route(async (req) => {
  const { sesi, outlet, tenantId } = await konteks("settings.manage");
  const body = skema.parse(await bacaJson(req));

  const lama = await prisma.outlet.findUniqueOrThrow({ where: { id: outlet.id } });
  const hasil = await prisma.outlet.update({
    where: { id: outlet.id },
    data: {
      name: body.name,
      address: body.address,
      phone: body.phone,
      taxConfig: body.taxConfig ? JSON.stringify(body.taxConfig) : undefined,
      receiptConfig: body.receiptConfig ? JSON.stringify(body.receiptConfig) : undefined,
    },
  });

  await catatAudit({
    tenantId,
    outletId: outlet.id,
    userId: sesi.userId,
    action: "SETTINGS_UPDATE",
    entity: "Outlet",
    entityId: outlet.id,
    before: {
      name: lama.name,
      address: lama.address,
      phone: lama.phone,
      taxConfig: parseTaxConfig(lama.taxConfig),
      receiptConfig: JSON.parse(lama.receiptConfig),
    },
    after: body,
  });

  return ok({ outlet: hasil });
});
