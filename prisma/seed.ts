/**
 * Seed data contoh: 1 tenant, 3 outlet (kafe/restoran/minimarket), 5 user,
 * 20+ produk Indonesia, modifier, meja, dan stok awal.
 * Jalankan: npm run db:seed  (atau `--if-empty` supaya tidak menimpa data).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const hash = (teks: string) => bcrypt.hash(teks, 12);

async function main() {
  const ifEmpty = process.argv.includes("--if-empty");
  const jumlahUser = await prisma.user.count();
  if (ifEmpty && jumlahUser > 0) {
    console.log(`[seed] dilewati, sudah ada ${jumlahUser} user`);
    return;
  }
  if (!ifEmpty) {
    // Reset total supaya seed bisa diulang saat development.
    await prisma.$transaction([
      prisma.printJob.deleteMany(),
      prisma.receipt.deleteMany(),
      prisma.paymentEvent.deleteMany(),
      prisma.orphanEvent.deleteMany(),
      prisma.refund.deleteMany(),
      prisma.payment.deleteMany(),
      prisma.orderItemModifier.deleteMany(),
      prisma.orderItem.deleteMany(),
      prisma.order.deleteMany(),
      prisma.receiptSequence.deleteMany(),
      prisma.stockMovement.deleteMany(),
      prisma.stock.deleteMany(),
      prisma.modifier.deleteMany(),
      prisma.modifierGroup.deleteMany(),
      prisma.productVariant.deleteMany(),
      prisma.product.deleteMany(),
      prisma.category.deleteMany(),
      prisma.diningTable.deleteMany(),
      prisma.shift.deleteMany(),
      prisma.auditLog.deleteMany(),
      prisma.userOutlet.deleteMany(),
      prisma.user.deleteMany(),
      prisma.outlet.deleteMany(),
      prisma.tenant.deleteMany(),
    ]);
  }

  const tenant = await prisma.tenant.create({
    data: { name: "Joji Grup", businessMode: "KAFE" },
  });

  // Dibuat berurutan supaya createdAt (urutan outlet default saat login) deterministik.
  const kafe = await prisma.outlet.create({
      data: {
        tenantId: tenant.id,
        code: "CRB",
        name: "KasirKu Coffee",
        address: "Jl. Melati No. 12, Bandung",
        phone: "0812-3456-7890",
        businessMode: "KAFE",
        taxConfig: JSON.stringify({ taxPercent: 10, taxInclusive: false, servicePercent: 5, roundingTo: 1000, roundingMode: "UP", taxName: "PB1" }),
        receiptConfig: JSON.stringify({ footer: "Terima kasih atas kunjungan Anda :)\nIG: @kasirku.coffee" }),
      },
    });
  const restoran = await prisma.outlet.create({
      data: {
        tenantId: tenant.id,
        code: "RST",
        name: "KasirKu Resto",
        address: "Jl. Merdeka No. 88, Bandung",
        phone: "0812-9876-5432",
        businessMode: "RESTORAN",
        taxConfig: JSON.stringify({ taxPercent: 10, taxInclusive: false, servicePercent: 5, roundingTo: 100, roundingMode: "NEAREST", taxName: "PB1" }),
        receiptConfig: JSON.stringify({ footer: "Terima kasih, sampai jumpa lagi" }),
      },
    });
  const minimarket = await prisma.outlet.create({
      data: {
        tenantId: tenant.id,
        code: "MKT",
        name: "KasirKu Mart",
        address: "Jl. Sukajadi No. 5, Bandung",
        phone: "0812-1111-2222",
        businessMode: "MINIMARKET",
        taxConfig: JSON.stringify({ taxPercent: 11, taxInclusive: true, servicePercent: 0, roundingTo: 100, roundingMode: "NEAREST", taxName: "PPN" }),
        receiptConfig: JSON.stringify({ footer: "Barang yang sudah dibeli tidak dapat ditukar" }),
      },
    });

  // Server online (Postgres): password demo publik dilarang; semua akun memakai SEED_PASSWORD.
  const online = /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? "");
  const sandiOnline = process.env.SEED_PASSWORD;
  if (online && (!sandiOnline || sandiOnline.length < 8)) {
    throw new Error("Set env SEED_PASSWORD (min 8 karakter) sebelum seed di server online");
  }
  const sandi = (demo: string) => (online ? sandiOnline! : demo);
  const [passOwner, passManager, passKasir, passDapur, passGudang, pinKasir, pinManager, pinOwner] = await Promise.all([
    hash(sandi("owner123")),
    hash(sandi("manager123")),
    hash(sandi("kasir123")),
    hash(sandi("dapur123")),
    hash(sandi("gudang123")),
    hash("1234"),
    hash("5678"),
    hash("0000"),
  ]);

  const owner = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      name: "Joji",
      email: "owner@kasirku.id",
      phone: "081200000001",
      passwordHash: passOwner,
      pinHash: pinOwner,
      outlets: {
        create: [
          { outletId: kafe.id, role: "OWNER" },
          { outletId: restoran.id, role: "OWNER" },
          { outletId: minimarket.id, role: "OWNER" },
        ],
      },
    },
  });

  const manager = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      name: "Rina",
      email: "manager@kasirku.id",
      phone: "081200000002",
      passwordHash: passManager,
      pinHash: pinManager,
      outlets: {
        create: [
          { outletId: kafe.id, role: "MANAGER" },
          { outletId: restoran.id, role: "MANAGER" },
          { outletId: minimarket.id, role: "MANAGER" },
        ],
      },
    },
  });

  const kasir = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      name: "Budi",
      email: "kasir@kasirku.id",
      phone: "081200000003",
      passwordHash: passKasir,
      pinHash: pinKasir,
      outlets: {
        create: [
          { outletId: kafe.id, role: "KASIR" },
          { outletId: restoran.id, role: "KASIR" },
          { outletId: minimarket.id, role: "KASIR" },
        ],
      },
    },
  });

  const dapur = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      name: "Sari",
      email: "dapur@kasirku.id",
      passwordHash: passDapur,
      outlets: { create: [{ outletId: restoran.id, role: "DAPUR" }, { outletId: kafe.id, role: "DAPUR" }] },
    },
  });

  const gudang = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      name: "Agus",
      email: "gudang@kasirku.id",
      passwordHash: passGudang,
      outlets: { create: [{ outletId: minimarket.id, role: "GUDANG" }] },
    },
  });

  console.log(`[seed] user: ${owner.email}, ${manager.email}, ${kasir.email}, ${dapur.email}, ${gudang.email}`);

  // ── Meja restoran & kafe (kafe: nomor meja opsional) ──────────────────────────
  for (let i = 1; i <= 8; i++) {
    await prisma.diningTable.create({
      data: { outletId: kafe.id, name: String(i).padStart(2, "0"), capacity: 2, area: "Utama" },
    });
  }
  for (let i = 1; i <= 8; i++) {
    await prisma.diningTable.create({
      data: {
        outletId: restoran.id,
        name: String(i).padStart(2, "0"),
        capacity: i <= 4 ? 2 : 4,
        area: i <= 4 ? "Indoor" : "Outdoor",
      },
    });
  }

  // ── Katalog kafe ─────────────────────────────────────────────────────────────
  const katKafe = await prisma.category.create({
    data: { outletId: kafe.id, name: "Kopi", sortOrder: 1 },
  });
  const katKafe2 = await prisma.category.create({
    data: { outletId: kafe.id, name: "Non-Kopi & Makanan", sortOrder: 2 },
  });

  const kopiSusu = await prisma.product.create({
    data: {
      outletId: kafe.id,
      categoryId: katKafe.id,
      name: "Kopi Susu",
      sku: "KOPI-SUSU",
      price: 22000,
      cost: 8000,
      imageEmoji: "☕",
      minQty: 10,
      modifierGroups: {
        create: [
          {
            name: "Suhu",
            minSelect: 1,
            maxSelect: 1,
            modifiers: {
              create: [
                { name: "Hot", priceDelta: 0 },
                { name: "Iced", priceDelta: 2000 },
              ],
            },
          },
          {
            name: "Sugar Level",
            minSelect: 0,
            maxSelect: 1,
            modifiers: {
              create: [
                { name: "Normal", priceDelta: 0 },
                { name: "Less Sugar", priceDelta: 0 },
                { name: "No Sugar", priceDelta: 0 },
              ],
            },
          },
          {
            name: "Extra",
            minSelect: 0,
            maxSelect: 2,
            modifiers: {
              create: [
                { name: "Extra Shot", priceDelta: 8000 },
                { name: "Oat Milk", priceDelta: 6000 },
              ],
            },
          },
        ],
      },
    },
  });

  const latte = await prisma.product.create({
    data: {
      outletId: kafe.id,
      categoryId: katKafe.id,
      name: "Caffe Latte",
      sku: "CAFFE-LATTE",
      price: 23000,
      cost: 9000,
      imageEmoji: "🥛",
      minQty: 10,
      variants: { create: [{ name: "Regular", priceDelta: 0 }, { name: "Large", priceDelta: 6000 }] },
      modifierGroups: {
        create: [
          {
            name: "Sugar Level",
            minSelect: 0,
            maxSelect: 1,
            modifiers: {
              create: [
                { name: "Normal", priceDelta: 0 },
                { name: "Less Sugar", priceDelta: 0 },
                { name: "No Sugar", priceDelta: 0 },
              ],
            },
          },
          {
            name: "Extra",
            minSelect: 0,
            maxSelect: 1,
            modifiers: { create: [{ name: "Extra Shot", priceDelta: 4000 }] },
          },
        ],
      },
    },
  });

  const americano = await prisma.product.create({
    data: {
      outletId: kafe.id,
      categoryId: katKafe.id,
      name: "Americano",
      sku: "AMERICANO",
      price: 20000,
      cost: 6000,
      imageEmoji: "☕",
      modifierGroups: {
        create: [
          {
            name: "Suhu",
            minSelect: 1,
            maxSelect: 1,
            modifiers: { create: [{ name: "Hot", priceDelta: 0 }, { name: "Iced", priceDelta: 2000 }] },
          },
        ],
      },
    },
  });

  const matcha = await prisma.product.create({
    data: {
      outletId: kafe.id,
      categoryId: katKafe2.id,
      name: "Matcha Latte",
      sku: "MATCHA",
      price: 27000,
      cost: 10000,
      imageEmoji: "🍵",
    },
  });

  const croissant = await prisma.product.create({
    data: {
      outletId: kafe.id,
      categoryId: katKafe2.id,
      name: "Croissant",
      sku: "CROISSANT",
      price: 25000,
      cost: 12000,
      imageEmoji: "🥐",
      minQty: 5,
    },
  });

  const donat = await prisma.product.create({
    data: {
      outletId: kafe.id,
      categoryId: katKafe2.id,
      name: "Donat Gula",
      sku: "DONAT",
      price: 12000,
      cost: 5000,
      imageEmoji: "🍩",
    },
  });

  // ── Katalog restoran ─────────────────────────────────────────────────────────
  const katMakanan = await prisma.category.create({
    data: { outletId: restoran.id, name: "Makanan", sortOrder: 1 },
  });
  const katMinuman = await prisma.category.create({
    data: { outletId: restoran.id, name: "Minuman", sortOrder: 2 },
  });

  const nasiGoreng = await prisma.product.create({
    data: {
      outletId: restoran.id,
      categoryId: katMakanan.id,
      name: "Nasi Goreng Spesial",
      sku: "NASGOR",
      price: 35000,
      cost: 14000,
      imageEmoji: "🍚",
      modifierGroups: {
        create: [
          {
            name: "Level Pedas",
            minSelect: 1,
            maxSelect: 1,
            modifiers: {
              create: [
                { name: "Tidak Pedas", priceDelta: 0 },
                { name: "Pedas Sedang", priceDelta: 0 },
                { name: "Pedas Maksimal", priceDelta: 0 },
              ],
            },
          },
          {
            name: "Tambahan",
            minSelect: 0,
            maxSelect: 2,
            modifiers: {
              create: [
                { name: "Telur Ceplok", priceDelta: 8000 },
                { name: "Ayam Goreng", priceDelta: 15000 },
              ],
            },
          },
        ],
      },
    },
  });

  await prisma.product.create({
    data: {
      outletId: restoran.id,
      categoryId: katMakanan.id,
      name: "Mie Goreng Jawa",
      sku: "MIEGOR",
      price: 32000,
      cost: 12000,
      imageEmoji: "🍜",
    },
  });

  await prisma.product.create({
    data: {
      outletId: restoran.id,
      categoryId: katMakanan.id,
      name: "Ayam Geprek",
      sku: "GEPREK",
      price: 28000,
      cost: 11000,
      imageEmoji: "🍗",
      modifierGroups: {
        create: [
          {
            name: "Level Pedas",
            minSelect: 1,
            maxSelect: 1,
            modifiers: {
              create: [
                { name: "Level 1", priceDelta: 0 },
                { name: "Level 3", priceDelta: 0 },
                { name: "Level 5", priceDelta: 0 },
              ],
            },
          },
        ],
      },
    },
  });

  await prisma.product.create({
    data: {
      outletId: restoran.id,
      categoryId: katMinuman.id,
      name: "Es Teh Manis",
      sku: "ESTEH",
      price: 10000,
      cost: 3000,
      imageEmoji: "🧊",
    },
  });

  await prisma.product.create({
    data: {
      outletId: restoran.id,
      categoryId: katMinuman.id,
      name: "Jus Alpukat",
      sku: "JUSALP",
      price: 22000,
      cost: 9000,
      imageEmoji: "🥑",
    },
  });

  // ── Katalog minimarket ───────────────────────────────────────────────────────
  const katSembako = await prisma.category.create({
    data: { outletId: minimarket.id, name: "Sembako", sortOrder: 1 },
  });
  const katMinum = await prisma.category.create({
    data: { outletId: minimarket.id, name: "Minuman", sortOrder: 2 },
  });
  const katRumah = await prisma.category.create({
    data: { outletId: minimarket.id, name: "Kebutuhan Rumah", sortOrder: 3 },
  });

  const barangMart = [
    { nama: "Beras Premium 5kg", sku: "BR-5KG", barcode: "8991234567890", harga: 72000, modal: 62000, emoji: "🍚", kat: katSembako.id },
    { nama: "Minyak Goreng 1L", sku: "MG-1L", barcode: "8991234567891", harga: 19000, modal: 16000, emoji: "🛢️", kat: katSembako.id },
    { nama: "Gula Pasir 1kg", sku: "GP-1KG", barcode: "8991234567892", harga: 17000, modal: 14000, emoji: "🍬", kat: katSembako.id },
    { nama: "Telur Ayam 1kg", sku: "TLR-1KG", barcode: "8991234567893", harga: 29000, modal: 25000, emoji: "🥚", kat: katSembako.id },
    { nama: "Indomie Goreng", sku: "IND-GRG", barcode: "8991234567894", harga: 3500, modal: 2900, emoji: "🍜", kat: katSembako.id },
    { nama: "Air Mineral 600ml", sku: "AM-600", barcode: "8991234567895", harga: 4000, modal: 2600, emoji: "💧", kat: katMinum.id },
    { nama: "Teh Botol 350ml", sku: "TB-350", barcode: "8991234567896", harga: 5000, modal: 3800, emoji: "🧃", kat: katMinum.id },
    { nama: "Susu UHT 1L", sku: "SU-1L", barcode: "8991234567897", harga: 21000, modal: 18000, emoji: "🥛", kat: katMinum.id },
    { nama: "Sabun Mandi", sku: "SBN", barcode: "8991234567898", harga: 6000, modal: 4200, emoji: "🧼", kat: katRumah.id },
    { nama: "Sampo 170ml", sku: "SMP", barcode: "8991234567899", harga: 24000, modal: 19000, emoji: "🧴", kat: katRumah.id },
    { nama: "Tisu Gulung", sku: "TSG", barcode: "8991234567800", harga: 8000, modal: 6000, emoji: "🧻", kat: katRumah.id },
    { nama: "Kopi Sachet", sku: "KPS", barcode: "8991234567801", harga: 2500, modal: 1900, emoji: "☕", kat: katMinum.id },
  ];

  const produkMart: string[] = [];
  for (const b of barangMart) {
    const p = await prisma.product.create({
      data: {
        outletId: minimarket.id,
        categoryId: b.kat,
        name: b.nama,
        sku: b.sku,
        barcode: b.barcode,
        price: b.harga,
        cost: b.modal,
        imageEmoji: b.emoji,
        minQty: 10,
      },
    });
    produkMart.push(p.id);
  }

  // ── Stok awal ────────────────────────────────────────────────────────────────
  const stokAwal: { outletId: string; productId: string; qty: number }[] = [
    { outletId: kafe.id, productId: kopiSusu.id, qty: 120 },
    { outletId: kafe.id, productId: latte.id, qty: 90 },
    { outletId: kafe.id, productId: americano.id, qty: 80 },
    { outletId: kafe.id, productId: matcha.id, qty: 60 },
    { outletId: kafe.id, productId: croissant.id, qty: 40 },
    { outletId: kafe.id, productId: donat.id, qty: 35 },
    { outletId: restoran.id, productId: nasiGoreng.id, qty: 50 },
  ];
  for (const p of produkMart) stokAwal.push({ outletId: minimarket.id, productId: p, qty: 60 });

  for (const s of stokAwal) {
    await prisma.stock.create({ data: { ...s, minQty: 10 } });
    await prisma.stockMovement.create({
      data: { outletId: s.outletId, productId: s.productId, type: "IN", qty: s.qty, note: "Stok awal" },
    });
  }

  if (online) {
    console.log("[seed] selesai. Semua akun (owner/manager/kasir/dapur/gudang @kasirku.id) memakai SEED_PASSWORD.");
    console.log("[seed] PIN awal: owner 0000, manager 5678, kasir 1234 — segera ganti di menu Pengguna.");
    return;
  }
  console.log("[seed] selesai. Login demo:");
  console.log("  owner@kasirku.id / owner123     (Owner)");
  console.log("  manager@kasirku.id / manager123 (Manager)");
  console.log("  kasir@kasirku.id / kasir123     (Kasir, PIN 1234)");
  console.log("  dapur@kasirku.id / dapur123     (Dapur)");
  console.log("  gudang@kasirku.id / gudang123   (Gudang)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
