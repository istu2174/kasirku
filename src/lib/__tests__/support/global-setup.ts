import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Siapkan SQLite khusus test: hapus file lama lalu push skema (tanpa --force-reset). */
export default function setup() {
  const url = "file:./data/test.db";
  process.env.DATABASE_URL = url;
  const dir = path.resolve(__dirname, "../../../../prisma/data");
  fs.mkdirSync(dir, { recursive: true });
  for (const akhiran of ["", "-journal", "-wal", "-shm"]) {
    fs.rmSync(path.join(dir, `test.db${akhiran}`), { force: true });
  }
  execSync("npx prisma db push --skip-generate", {
    cwd: path.resolve(__dirname, "../../../.."),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
