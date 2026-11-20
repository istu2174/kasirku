// Pilih provider Prisma dari DATABASE_URL: postgres://… → postgresql, file:… → sqlite.
// Dev lokal & test tetap SQLite; deploy (Render/Neon) otomatis PostgreSQL tanpa edit schema manual.
import { readFileSync, writeFileSync } from "node:fs";

const url = process.env.DATABASE_URL ?? "";
const provider = /^postgres(ql)?:\/\//.test(url) ? "postgresql" : "sqlite";
const file = new URL("../prisma/schema.prisma", import.meta.url);
const isi = readFileSync(file, "utf8");
const baru = isi.replace(/(datasource db \{[^}]*provider\s*=\s*)"(sqlite|postgresql)"/, `$1"${provider}"`);
if (baru !== isi) writeFileSync(file, baru);
console.log(`[db-provider] ${provider}`);
