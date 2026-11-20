"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, Pencil, Plus, Tags, Trash2, Upload, X } from "lucide-react";
import { api, rupiah } from "@/lib/client";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Textarea, Toast } from "@/components/ui";

type Opsi = { id?: string; name: string; priceDelta: number };
type Grup = { id?: string; name: string; minSelect: number; maxSelect: number; modifiers: Opsi[] };
type Produk = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  price: number;
  cost: number;
  imageEmoji: string;
  trackStock: boolean;
  minQty: number;
  isActive: boolean;
  stock: number;
  variants: Opsi[];
  modifierGroups: Grup[];
};
type Kategori = { id: string; name: string; sortOrder: number; _count: { products: number } };
type HasilImport = { total: number; dibuat: number; diubah: number; gagal: { baris: number; sku: string; error: string }[] };

// Form menyimpan angka sebagai string supaya input bisa dikosongkan; dikonversi saat simpan.
type FormOpsi = { id?: string; name: string; priceDelta: string };
type FormGrup = { id?: string; name: string; minSelect: string; maxSelect: string; modifiers: FormOpsi[] };
type Form = {
  name: string;
  sku: string;
  barcode: string;
  categoryId: string;
  price: string;
  cost: string;
  imageEmoji: string;
  trackStock: boolean;
  minQty: string;
  isActive: boolean;
  variants: FormOpsi[];
  modifierGroups: FormGrup[];
};

const FORM_KOSONG: Form = {
  name: "",
  sku: "",
  barcode: "",
  categoryId: "",
  price: "",
  cost: "0",
  imageEmoji: "🍽️",
  trackStock: true,
  minQty: "0",
  isActive: true,
  variants: [],
  modifierGroups: [],
};

const HEADER_CSV = "name,sku,barcode,category,price,cost,emoji,trackStock,minQty,stock";

function bulat(nilai: string, label: string, bolehMinus = false): number {
  const n = Number(nilai);
  if (nilai.trim() === "" || !Number.isInteger(n)) throw new Error(`${label} harus bilangan bulat`);
  if (!bolehMinus && n < 0) throw new Error(`${label} tidak boleh negatif`);
  return n;
}

function keForm(p: Produk): Form {
  return {
    name: p.name,
    sku: p.sku,
    barcode: p.barcode ?? "",
    categoryId: p.categoryId ?? "",
    price: String(p.price),
    cost: String(p.cost),
    imageEmoji: p.imageEmoji,
    trackStock: p.trackStock,
    minQty: String(p.minQty),
    isActive: p.isActive,
    variants: p.variants.map((v) => ({ id: v.id, name: v.name, priceDelta: String(v.priceDelta) })),
    modifierGroups: p.modifierGroups.map((g) => ({
      id: g.id,
      name: g.name,
      minSelect: String(g.minSelect),
      maxSelect: String(g.maxSelect),
      modifiers: g.modifiers.map((m) => ({ id: m.id, name: m.name, priceDelta: String(m.priceDelta) })),
    })),
  };
}

function dariForm(f: Form) {
  return {
    name: f.name.trim(),
    sku: f.sku.trim(),
    barcode: f.barcode.trim() || null,
    categoryId: f.categoryId || null,
    price: bulat(f.price, "Harga jual"),
    cost: bulat(f.cost, "Harga modal"),
    imageEmoji: f.imageEmoji.trim() || "🍽️",
    trackStock: f.trackStock,
    minQty: bulat(f.minQty, "Stok minimum"),
    isActive: f.isActive,
    variants: f.variants.map((v) => ({ id: v.id, name: v.name.trim(), priceDelta: bulat(v.priceDelta, `Selisih harga varian ${v.name}`, true) })),
    modifierGroups: f.modifierGroups.map((g) => ({
      id: g.id,
      name: g.name.trim(),
      minSelect: bulat(g.minSelect, `Min pilih ${g.name}`),
      maxSelect: bulat(g.maxSelect, `Max pilih ${g.name}`),
      modifiers: g.modifiers.map((m) => ({ id: m.id, name: m.name.trim(), priceDelta: bulat(m.priceDelta, `Harga modifier ${m.name}`, true) })),
    })),
  };
}

export default function ProductsClient() {
  const [produk, setProduk] = useState<Produk[]>([]);
  const [kategori, setKategori] = useState<Kategori[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [cari, setCari] = useState("");
  const [filterKategori, setFilterKategori] = useState("");
  const [filterStatus, setFilterStatus] = useState<"aktif" | "nonaktif" | "semua">("aktif");
  const [toast, setToast] = useState<{ pesan: string; tone: "error" | "ok" } | null>(null);

  const [form, setForm] = useState<Form | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [hapus, setHapus] = useState<Produk | null>(null);
  const [bukaKategori, setBukaKategori] = useState(false);
  const [bukaImport, setBukaImport] = useState(false);

  const kabari = useCallback((pesan: string, tone: "error" | "ok" = "ok") => {
    setToast({ pesan, tone });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const muat = useCallback(async () => {
    try {
      const [p, k] = await Promise.all([
        api<{ products: Produk[] }>("/api/products?all=1"),
        api<{ categories: Kategori[] }>("/api/categories"),
      ]);
      setProduk(p.products);
      setKategori(k.categories);
    } catch (e) {
      kabari(e instanceof Error ? e.message : "Gagal memuat produk", "error");
    } finally {
      setMemuat(false);
    }
  }, [kabari]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return produk.filter(
      (p) =>
        (filterStatus === "semua" || (filterStatus === "aktif") === p.isActive) &&
        (!filterKategori || p.categoryId === filterKategori) &&
        (!q || [p.name, p.sku, p.barcode ?? ""].some((v) => v.toLowerCase().includes(q))),
    );
  }, [produk, cari, filterKategori, filterStatus]);

  function bukaForm(p?: Produk) {
    setEditId(p?.id ?? null);
    setForm(p ? keForm(p) : { ...FORM_KOSONG, categoryId: filterKategori });
  }

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setMenyimpan(true);
    try {
      const body = JSON.stringify(dariForm(form));
      if (editId) await api(`/api/products/${editId}`, { method: "PATCH", body });
      else await api("/api/products", { method: "POST", body });
      kabari(editId ? "Produk diperbarui" : "Produk ditambahkan");
      setForm(null);
      await muat();
    } catch (err) {
      kabari(err instanceof Error ? err.message : "Gagal menyimpan", "error");
    } finally {
      setMenyimpan(false);
    }
  }

  async function nonaktifkan() {
    if (!hapus) return;
    try {
      await api(`/api/products/${hapus.id}`, { method: "DELETE" });
      kabari(`${hapus.name} dinonaktifkan`);
      setHapus(null);
      await muat();
    } catch (err) {
      kabari(err instanceof Error ? err.message : "Gagal menonaktifkan", "error");
    }
  }

  async function aktifkan(p: Produk) {
    try {
      await api(`/api/products/${p.id}`, { method: "PATCH", body: JSON.stringify({ isActive: true }) });
      kabari(`${p.name} diaktifkan kembali`);
      await muat();
    } catch (err) {
      kabari(err instanceof Error ? err.message : "Gagal mengaktifkan", "error");
    }
  }

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Produk"
        subtitle="Kelola menu, harga, varian, modifier, dan kategori"
        actions={
          <>
            <Button variant="outline" onClick={() => setBukaKategori(true)}>
              <Tags size={16} /> Kategori
            </Button>
            <Button variant="outline" onClick={() => setBukaImport(true)}>
              <Upload size={16} /> Import CSV
            </Button>
            <Button variant="outline" onClick={() => window.location.assign("/api/products/export")}>
              <Download size={16} /> Export CSV
            </Button>
            <Button onClick={() => bukaForm()}>
              <Plus size={16} /> Tambah produk
            </Button>
          </>
        }
      />

      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_200px_160px]">
        <Input placeholder="Cari nama, SKU, atau barcode…" value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari produk" />
        <Select value={filterKategori} onChange={(e) => setFilterKategori(e.target.value)} aria-label="Filter kategori">
          <option value="">Semua kategori</option>
          {kategori.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </Select>
        <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)} aria-label="Filter status">
          <option value="aktif">Aktif</option>
          <option value="nonaktif">Nonaktif</option>
          <option value="semua">Semua status</option>
        </Select>
      </Card>

      {memuat ? (
        <Empty>Memuat produk…</Empty>
      ) : tampil.length === 0 ? (
        <Empty>Belum ada produk yang cocok.</Empty>
      ) : (
        <Card className="overflow-x-auto p-2">
          <table className="tabel">
            <thead>
              <tr>
                <th>Produk</th>
                <th>SKU</th>
                <th>Barcode</th>
                <th>Kategori</th>
                <th className="text-right">Harga</th>
                <th className="text-right">Modal</th>
                <th className="text-right">Stok</th>
                <th>Status</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {tampil.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="neu-in grid h-11 w-11 shrink-0 place-items-center text-xl" aria-hidden>
                        {p.imageEmoji}
                      </span>
                      <div>
                        <p className="font-semibold text-fg">{p.name}</p>
                        {(p.variants.length > 0 || p.modifierGroups.length > 0) && (
                          <p className="text-xs text-muted">
                            {p.variants.length} varian · {p.modifierGroups.length} grup modifier
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="font-mono text-xs">{p.sku}</td>
                  <td className="font-mono text-xs text-muted">{p.barcode ?? "—"}</td>
                  <td>{p.category?.name ?? <span className="text-muted">—</span>}</td>
                  <td className="uang text-right">{rupiah(p.price)}</td>
                  <td className="uang text-right text-muted">{rupiah(p.cost)}</td>
                  <td className="text-right">
                    {!p.trackStock ? (
                      <span className="text-muted">—</span>
                    ) : p.stock < 0 ? (
                      <Badge tone="red">{p.stock} minus</Badge>
                    ) : p.stock <= p.minQty ? (
                      <Badge tone="amber">{p.stock} kritis</Badge>
                    ) : (
                      <span className="uang">{p.stock}</span>
                    )}
                  </td>
                  <td>{p.isActive ? <Badge tone="green">Aktif</Badge> : <Badge>Nonaktif</Badge>}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => bukaForm(p)} aria-label={`Ubah ${p.name}`}>
                        <Pencil size={16} />
                      </Button>
                      {p.isActive ? (
                        <Button size="sm" variant="ghost" onClick={() => setHapus(p)} aria-label={`Nonaktifkan ${p.name}`}>
                          <Trash2 size={16} />
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => aktifkan(p)}>
                          Aktifkan
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={form !== null} onClose={() => setForm(null)} title={editId ? "Ubah produk" : "Tambah produk"} wide>
        {form && (
          <FormProduk form={form} setForm={setForm} kategori={kategori} onSubmit={simpan} menyimpan={menyimpan} onBatal={() => setForm(null)} />
        )}
      </Modal>

      <Modal open={hapus !== null} onClose={() => setHapus(null)} title="Nonaktifkan produk?">
        {hapus && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              <span className="font-semibold text-fg">
                {hapus.imageEmoji} {hapus.name}
              </span>{" "}
              tidak akan tampil di kasir. Riwayat transaksi tetap utuh dan produk bisa diaktifkan lagi.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setHapus(null)}>
                Batal
              </Button>
              <Button variant="danger" onClick={nonaktifkan}>
                Nonaktifkan
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ModalKategori open={bukaKategori} onClose={() => setBukaKategori(false)} kategori={kategori} onUbah={muat} kabari={kabari} />
      <ModalImport open={bukaImport} onClose={() => setBukaImport(false)} onSelesai={muat} kabari={kabari} />

      <Toast pesan={toast?.pesan ?? null} tone={toast?.tone} />
    </div>
  );
}

function FormProduk({
  form,
  setForm,
  kategori,
  onSubmit,
  menyimpan,
  onBatal,
}: {
  form: Form;
  setForm: (f: Form) => void;
  kategori: Kategori[];
  onSubmit: (e: React.FormEvent) => void;
  menyimpan: boolean;
  onBatal: () => void;
}) {
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  const setGrup = (i: number, g: FormGrup) => set("modifierGroups", form.modifierGroups.map((x, j) => (j === i ? g : x)));

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[96px_1fr]">
        <Field label="Emoji">
          <Input value={form.imageEmoji} onChange={(e) => set("imageEmoji", e.target.value)} className="text-center text-xl" maxLength={8} />
        </Field>
        <Field label="Nama produk">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} required minLength={2} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="SKU">
          <Input value={form.sku} onChange={(e) => set("sku", e.target.value)} required minLength={2} />
        </Field>
        <Field label="Barcode" hint="Opsional">
          <Input value={form.barcode} onChange={(e) => set("barcode", e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Kategori">
          <Select value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            <option value="">Tanpa kategori</option>
            {kategori.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Harga jual (Rp)">
          <Input type="number" min={0} step={1} inputMode="numeric" value={form.price} onChange={(e) => set("price", e.target.value)} required className="uang" />
        </Field>
        <Field label="Harga modal (Rp)">
          <Input type="number" min={0} step={1} inputMode="numeric" value={form.cost} onChange={(e) => set("cost", e.target.value)} required className="uang" />
        </Field>
        <Field label="Stok minimum" hint="Badge kritis kalau stok ≤ angka ini">
          <Input type="number" min={0} step={1} inputMode="numeric" value={form.minQty} onChange={(e) => set("minQty", e.target.value)} required />
        </Field>
      </div>
      <div className="flex flex-wrap gap-6">
        <label className="flex min-h-11 items-center gap-2 text-sm text-fg">
          <input type="checkbox" className="h-5 w-5 accent-brand-500" checked={form.trackStock} onChange={(e) => set("trackStock", e.target.checked)} />
          Lacak stok
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-fg">
          <input type="checkbox" className="h-5 w-5 accent-brand-500" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} />
          Aktif (tampil di kasir)
        </label>
      </div>

      <section className="neu-in space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-fg">Varian</h4>
          <Button type="button" size="sm" variant="outline" onClick={() => set("variants", [...form.variants, { name: "", priceDelta: "0" }])}>
            <Plus size={14} /> Varian
          </Button>
        </div>
        {form.variants.length === 0 && <p className="text-xs text-muted">Tanpa varian (mis. ukuran Regular/Large).</p>}
        {form.variants.map((v, i) => (
          <BarisOpsi
            key={v.id ?? `baru-${i}`}
            opsi={v}
            labelHarga="Selisih harga"
            onUbah={(baru) => set("variants", form.variants.map((x, j) => (j === i ? baru : x)))}
            onHapus={() => set("variants", form.variants.filter((_, j) => j !== i))}
          />
        ))}
      </section>

      <section className="neu-in space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-fg">Grup modifier</h4>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => set("modifierGroups", [...form.modifierGroups, { name: "", minSelect: "0", maxSelect: "1", modifiers: [] }])}
          >
            <Plus size={14} /> Grup
          </Button>
        </div>
        {form.modifierGroups.length === 0 && <p className="text-xs text-muted">Tanpa modifier (mis. level gula, topping).</p>}
        {form.modifierGroups.map((g, i) => (
          <div key={g.id ?? `grup-${i}`} className="neu space-y-3 p-3">
            <div className="grid items-end gap-2 sm:grid-cols-[1fr_96px_96px_auto]">
              <Field label="Nama grup">
                <Input value={g.name} onChange={(e) => setGrup(i, { ...g, name: e.target.value })} required />
              </Field>
              <Field label="Min pilih">
                <Input type="number" min={0} step={1} value={g.minSelect} onChange={(e) => setGrup(i, { ...g, minSelect: e.target.value })} required />
              </Field>
              <Field label="Max pilih">
                <Input type="number" min={1} step={1} value={g.maxSelect} onChange={(e) => setGrup(i, { ...g, maxSelect: e.target.value })} required />
              </Field>
              <Button
                type="button"
                variant="ghost"
                onClick={() => set("modifierGroups", form.modifierGroups.filter((_, j) => j !== i))}
                aria-label={`Hapus grup ${g.name}`}
              >
                <Trash2 size={16} />
              </Button>
            </div>
            {g.modifiers.map((m, k) => (
              <BarisOpsi
                key={m.id ?? `mod-${k}`}
                opsi={m}
                labelHarga="Harga"
                onUbah={(baru) => setGrup(i, { ...g, modifiers: g.modifiers.map((x, j) => (j === k ? baru : x)) })}
                onHapus={() => setGrup(i, { ...g, modifiers: g.modifiers.filter((_, j) => j !== k) })}
              />
            ))}
            <Button type="button" size="sm" variant="ghost" onClick={() => setGrup(i, { ...g, modifiers: [...g.modifiers, { name: "", priceDelta: "0" }] })}>
              <Plus size={14} /> Modifier
            </Button>
          </div>
        ))}
      </section>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onBatal}>
          Batal
        </Button>
        <Button type="submit" disabled={menyimpan}>
          {menyimpan ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
    </form>
  );
}

function BarisOpsi({
  opsi,
  labelHarga,
  onUbah,
  onHapus,
}: {
  opsi: FormOpsi;
  labelHarga: string;
  onUbah: (o: FormOpsi) => void;
  onHapus: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_120px_auto] items-center gap-2">
      <Input placeholder="Nama" value={opsi.name} onChange={(e) => onUbah({ ...opsi, name: e.target.value })} required aria-label="Nama" />
      <Input
        type="number"
        step={1}
        inputMode="numeric"
        placeholder={labelHarga}
        value={opsi.priceDelta}
        onChange={(e) => onUbah({ ...opsi, priceDelta: e.target.value })}
        required
        className="uang"
        aria-label={labelHarga}
      />
      <Button type="button" variant="ghost" onClick={onHapus} aria-label={`Hapus ${opsi.name}`}>
        <X size={16} />
      </Button>
    </div>
  );
}

function ModalKategori({
  open,
  onClose,
  kategori,
  onUbah,
  kabari,
}: {
  open: boolean;
  onClose: () => void;
  kategori: Kategori[];
  onUbah: () => Promise<void>;
  kabari: (p: string, t?: "error" | "ok") => void;
}) {
  const [nama, setNama] = useState("");
  const [sibuk, setSibuk] = useState(false);

  async function jalankan(aksi: () => Promise<unknown>, pesanOk: string) {
    setSibuk(true);
    try {
      await aksi();
      await onUbah();
      kabari(pesanOk);
    } catch (err) {
      kabari(err instanceof Error ? err.message : "Gagal", "error");
    } finally {
      setSibuk(false);
    }
  }

  function geser(i: number, arah: -1 | 1) {
    const urut = kategori.map((k) => k.id);
    [urut[i], urut[i + arah]] = [urut[i + arah], urut[i]];
    void jalankan(() => api("/api/categories", { method: "PATCH", body: JSON.stringify({ order: urut }) }), "Urutan disimpan");
  }

  return (
    <Modal open={open} onClose={onClose} title="Kategori">
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void jalankan(
            () => api("/api/categories", { method: "POST", body: JSON.stringify({ name: nama.trim(), sortOrder: kategori.length }) }),
            "Kategori ditambahkan",
          ).then(() => setNama(""));
        }}
      >
        <Input placeholder="Nama kategori baru" value={nama} onChange={(e) => setNama(e.target.value)} required minLength={2} aria-label="Nama kategori" />
        <Button type="submit" disabled={sibuk}>
          <Plus size={16} /> Tambah
        </Button>
      </form>
      {kategori.length === 0 ? (
        <Empty>Belum ada kategori.</Empty>
      ) : (
        <ul className="space-y-2">
          {kategori.map((k, i) => (
            <li key={k.id} className="neu-in flex items-center gap-2 px-4 py-2">
              <span className="flex-1 text-sm text-fg">
                {k.name} <span className="text-xs text-muted">({k._count.products} produk)</span>
              </span>
              <Button size="sm" variant="ghost" disabled={sibuk || i === 0} onClick={() => geser(i, -1)} aria-label={`Naikkan ${k.name}`}>
                <ArrowUp size={16} />
              </Button>
              <Button size="sm" variant="ghost" disabled={sibuk || i === kategori.length - 1} onClick={() => geser(i, 1)} aria-label={`Turunkan ${k.name}`}>
                <ArrowDown size={16} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function ModalImport({
  open,
  onClose,
  onSelesai,
  kabari,
}: {
  open: boolean;
  onClose: () => void;
  onSelesai: () => Promise<void>;
  kabari: (p: string, t?: "error" | "ok") => void;
}) {
  const [teks, setTeks] = useState("");
  const [hasil, setHasil] = useState<HasilImport | null>(null);
  const [sibuk, setSibuk] = useState(false);

  async function kirim() {
    setSibuk(true);
    try {
      const r = await api<HasilImport>("/api/products/import", {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: teks,
      });
      setHasil(r);
      kabari(`Import selesai: ${r.dibuat} baru, ${r.diubah} diperbarui, ${r.gagal.length} gagal`, r.gagal.length ? "error" : "ok");
      await onSelesai();
    } catch (err) {
      kabari(err instanceof Error ? err.message : "Import gagal", "error");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setHasil(null);
        onClose();
      }}
      title="Import produk dari CSV"
      wide
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Baris pertama wajib header: <code className="font-mono text-xs text-brand-200">{HEADER_CSV}</code>. Harga & modal dalam rupiah
          bulat. Produk dengan SKU yang sudah ada akan diperbarui; kolom stock (opsional) menyetel stok dan tercatat sebagai mutasi.
        </p>
        <Field label="File CSV">
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setTeks(await f.text());
            }}
          />
        </Field>
        <Field label="Atau tempel isi CSV">
          <Textarea rows={6} value={teks} onChange={(e) => setTeks(e.target.value)} placeholder={`${HEADER_CSV}\nKopi Susu,KS-01,,Minuman,18000,7000,☕,1,5,20`} className="font-mono text-xs" />
        </Field>
        <div className="flex justify-end">
          <Button onClick={kirim} disabled={sibuk || !teks.trim()}>
            <Upload size={16} /> {sibuk ? "Mengimpor…" : "Import"}
          </Button>
        </div>
        {hasil && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge tone="blue">{hasil.total} baris</Badge>
              <Badge tone="green">{hasil.dibuat} baru</Badge>
              <Badge tone="green">{hasil.diubah} diperbarui</Badge>
              <Badge tone={hasil.gagal.length ? "red" : "neutral"}>{hasil.gagal.length} gagal</Badge>
            </div>
            {hasil.gagal.length > 0 && (
              <div className="overflow-x-auto">
                <table className="tabel">
                  <thead>
                    <tr>
                      <th>Baris</th>
                      <th>SKU</th>
                      <th>Masalah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hasil.gagal.map((g) => (
                      <tr key={g.baris}>
                        <td>{g.baris}</td>
                        <td className="font-mono text-xs">{g.sku || "—"}</td>
                        <td className="text-rose-300">{g.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
