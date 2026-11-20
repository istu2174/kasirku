export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const teks = await res.text();
  const data = teks ? JSON.parse(teks) : {};

  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Gagal (${res.status})`);
  }
  return data as T;
}

export const rupiah = (n: number) => "Rp" + new Intl.NumberFormat("id-ID").format(Math.round(n));
export const angka = (n: number) => new Intl.NumberFormat("id-ID").format(n);
