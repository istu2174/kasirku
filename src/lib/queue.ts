import "server-only";

/**
 * Queue job async (struk, notifikasi, sinkronisasi).
 * Production: BullMQ + Redis (set REDIS_URL).
 * Dev tanpa Redis: adapter in-memory dengan interface sama (job hilang saat restart,
 * cukup untuk lokal; jangan dipakai di production).
 */

export type JobName = "receipt.print" | "notification.push";
export type JobHandler = (payload: unknown) => Promise<void>;

type JobRecord = {
  id: string;
  name: JobName;
  payload: unknown;
  attempts: number;
  status: "QUEUED" | "RUNNING" | "DONE" | "DEAD";
  error?: string;
};

// Disimpan di globalThis: Next.js membundel instrumentation & route sebagai modul terpisah,
// jadi state level-modul tidak terbagi dan handler yang dipasang saat start tidak terlihat oleh route.
const g = globalThis as unknown as { __kasirkuQueue?: { handlers: Map<JobName, JobHandler>; memori: JobRecord[] } };
g.__kasirkuQueue ??= { handlers: new Map(), memori: [] };
const { handlers, memori } = g.__kasirkuQueue;

export function daftarkanHandler(name: JobName, handler: JobHandler) {
  handlers.set(name, handler);
}

export function daftarJob() {
  return memori.slice(-50).reverse();
}

async function jalankanLokal(job: JobRecord) {
  const handler = handlers.get(job.name);
  if (!handler) {
    job.status = "DEAD";
    job.error = `Tidak ada handler untuk ${job.name}`;
    return;
  }
  for (let i = 0; i < 5; i++) {
    try {
      job.attempts = i + 1;
      job.status = "RUNNING";
      await handler(job.payload);
      job.status = "DONE";
      return;
    } catch (err) {
      job.error = err instanceof Error ? err.message : String(err);
      // exponential backoff: 100ms, 200ms, 400ms, 800ms
      await new Promise((r) => setTimeout(r, 100 * 2 ** i));
    }
  }
  job.status = "DEAD"; // dead-letter setelah 5 percobaan
}

const gb = globalThis as unknown as { __kasirkuBull?: { queue: import("bullmq").Queue } };

async function bullQueue() {
  if (!process.env.REDIS_URL) return null;
  if (gb.__kasirkuBull) return gb.__kasirkuBull.queue;
  const { Queue, Worker } = await import("bullmq");
  const koneksi = { url: process.env.REDIS_URL } as never;
  const queue = new Queue("kasirku", { connection: koneksi });
  // Worker di proses yang sama; di production pindahkan ke proses terpisah.
  new Worker(
    "kasirku",
    async (job) => {
      const handler = handlers.get(job.name as JobName);
      if (!handler) throw new Error(`Tidak ada handler untuk ${job.name}`);
      await handler(job.data);
    },
    { connection: koneksi },
  );
  gb.__kasirkuBull = { queue };
  return queue;
}

export async function enqueue(name: JobName, payload: unknown): Promise<string> {
  const queue = await bullQueue();
  if (queue) {
    const job = await queue.add(name, payload, {
      attempts: 5,
      backoff: { type: "exponential", delay: 200 },
      removeOnComplete: 200,
      removeOnFail: 1000,
    });
    return String(job.id);
  }

  const job: JobRecord = {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    payload,
    attempts: 0,
    status: "QUEUED",
  };
  memori.push(job);
  if (memori.length > 200) memori.shift();
  void jalankanLokal(job); // fire & forget, handler idempotent
  return job.id;
}

export const modeQueue = () => (process.env.REDIS_URL ? "bullmq" : "in-memory");
