"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Pencil, Plus } from "lucide-react";
import { api } from "@/lib/client";
import { tanggalWaktu } from "@/lib/format";
import { LABEL_ROLE, ROLES, type Role } from "@/lib/rbac";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Toast } from "@/components/ui";

type Pengguna = {
  id: string;
  name: string;
  email: string;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
  role: Role | null;
  punyaPin: boolean;
};

const PIN_VALID = /^\d{4,6}$/;

export default function UsersClient({ userIdSaya }: { userIdSaya: string }) {
  const [users, setUsers] = useState<Pengguna[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [toast, setToast] = useState<{ pesan: string; tone: "error" | "ok" } | null>(null);
  const [bukaTambah, setBukaTambah] = useState(false);
  const [ubah, setUbah] = useState<Pengguna | null>(null);
  const [resetPin, setResetPin] = useState<Pengguna | null>(null);
  const [resetSandi, setResetSandi] = useState<Pengguna | null>(null);
  const [sandiBaru, setSandiBaru] = useState("");

  const kabari = useCallback((pesan: string, tone: "error" | "ok" = "ok") => {
    setToast({ pesan, tone });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const muat = useCallback(async () => {
    try {
      setUsers((await api<{ users: Pengguna[] }>("/api/users")).users);
    } catch (e) {
      kabari(e instanceof Error ? e.message : "Gagal memuat pengguna", "error");
    } finally {
      setMemuat(false);
    }
  }, [kabari]);

  useEffect(() => {
    void muat();
  }, [muat]);

  async function patch(id: string, body: object, pesanOk: string) {
    await api(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    kabari(pesanOk);
    await muat();
  }

  return (
    <div className="p-4 lg:p-8">
      <PageHeader
        title="Pengguna"
        subtitle="Akun staf outlet, role, status, dan PIN"
        actions={
          <Button onClick={() => setBukaTambah(true)}>
            <Plus size={16} /> Tambah pengguna
          </Button>
        }
      />

      {memuat ? (
        <Empty>Memuat pengguna…</Empty>
      ) : users.length === 0 ? (
        <Empty>Belum ada pengguna di outlet ini.</Empty>
      ) : (
        <Card className="overflow-x-auto p-2">
          <table className="tabel">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>PIN</th>
                <th>Dibuat</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="font-semibold text-fg">
                    {u.name} {u.id === userIdSaya && <Badge tone="blue">Anda</Badge>}
                  </td>
                  <td className="text-muted">{u.email}</td>
                  <td>{u.role ? LABEL_ROLE[u.role] : "—"}</td>
                  <td>{u.status === "ACTIVE" ? <Badge tone="green">Aktif</Badge> : <Badge tone="red">Ditangguhkan</Badge>}</td>
                  <td>{u.punyaPin ? <Badge tone="blue">Ada</Badge> : <Badge>Belum</Badge>}</td>
                  <td className="whitespace-nowrap text-xs text-muted">{tanggalWaktu(u.createdAt)}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setUbah(u)} aria-label={`Ubah ${u.name}`}>
                        <Pencil size={16} />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setResetPin(u)}>
                        <KeyRound size={14} /> PIN
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSandiBaru("");
                          setResetSandi(u);
                        }}
                      >
                        Sandi
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <ModalTambah open={bukaTambah} onClose={() => setBukaTambah(false)} onSelesai={muat} kabari={kabari} />

      <Modal open={ubah !== null} onClose={() => setUbah(null)} title={ubah ? `Ubah ${ubah.name}` : ""}>
        {ubah && (
          <FormUbah
            user={ubah}
            diriSendiri={ubah.id === userIdSaya}
            onBatal={() => setUbah(null)}
            onSimpan={async (body) => {
              try {
                await patch(ubah.id, body, "Pengguna diperbarui");
                setUbah(null);
              } catch (err) {
                kabari(err instanceof Error ? err.message : "Gagal menyimpan", "error");
              }
            }}
          />
        )}
      </Modal>

      <Modal open={resetPin !== null} onClose={() => setResetPin(null)} title={resetPin ? `PIN ${resetPin.name}` : ""}>
        {resetPin && (
          <FormPin
            user={resetPin}
            onBatal={() => setResetPin(null)}
            onSimpan={async (pin) => {
              try {
                await patch(resetPin.id, { pin }, pin ? "PIN direset" : "PIN dihapus");
                setResetPin(null);
              } catch (err) {
                kabari(err instanceof Error ? err.message : "Gagal menyimpan PIN", "error");
              }
            }}
          />
        )}
      </Modal>

      <Modal open={resetSandi !== null} onClose={() => setResetSandi(null)} title={resetSandi ? `Ganti sandi ${resetSandi.name}` : ""}>
        {resetSandi && (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await patch(resetSandi.id, { password: sandiBaru }, "Sandi diganti");
                setResetSandi(null);
              } catch (err) {
                kabari(err instanceof Error ? err.message : "Gagal mengganti sandi", "error");
              }
            }}
          >
            <Field label="Sandi baru" hint="Minimal 8 karakter. Sampaikan langsung ke orangnya, jangan lewat chat grup.">
              <Input
                type="password"
                value={sandiBaru}
                onChange={(e) => setSandiBaru(e.target.value)}
                minLength={8}
                required
                autoComplete="new-password"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setResetSandi(null)}>
                Batal
              </Button>
              <Button type="submit" disabled={sandiBaru.length < 8}>
                Simpan
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Toast pesan={toast?.pesan ?? null} tone={toast?.tone} />
    </div>
  );
}

function ModalTambah({
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
  const kosong = { name: "", email: "", password: "", pin: "", role: "KASIR" as Role };
  const [f, setF] = useState(kosong);
  const [sibuk, setSibuk] = useState(false);

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    if (f.pin && !PIN_VALID.test(f.pin)) return kabari("PIN harus 4–6 digit angka", "error");
    setSibuk(true);
    try {
      await api("/api/users", {
        method: "POST",
        body: JSON.stringify({ name: f.name.trim(), email: f.email.trim(), password: f.password, role: f.role, ...(f.pin ? { pin: f.pin } : {}) }),
      });
      kabari("Pengguna ditambahkan");
      setF(kosong);
      onClose();
      await onSelesai();
    } catch (err) {
      kabari(err instanceof Error ? err.message : "Gagal menambah pengguna", "error");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Tambah pengguna">
      <form onSubmit={kirim} className="space-y-4">
        <Field label="Nama">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} />
        </Field>
        <Field label="Email">
          <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required autoComplete="off" />
        </Field>
        <Field label="Password" hint="Minimal 6 karakter">
          <Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={6} autoComplete="new-password" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="PIN" hint="Opsional, 4–6 digit">
            <Input type="password" inputMode="numeric" pattern="\d{4,6}" value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value })} autoComplete="new-password" />
          </Field>
          <Field label="Role">
            <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {LABEL_ROLE[r]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" disabled={sibuk}>
            {sibuk ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function FormUbah({
  user,
  diriSendiri,
  onBatal,
  onSimpan,
}: {
  user: Pengguna;
  diriSendiri: boolean;
  onBatal: () => void;
  onSimpan: (body: { role?: Role; status: Pengguna["status"] }) => Promise<void>;
}) {
  const [role, setRole] = useState<Role>(user.role ?? "KASIR");
  const [status, setStatus] = useState(user.status);
  const [sibuk, setSibuk] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSibuk(true);
        await onSimpan({ status, ...(role !== user.role ? { role } : {}) });
        setSibuk(false);
      }}
    >
      <Field label="Role" hint={diriSendiri ? "Role akun sendiri tidak bisa diubah" : undefined}>
        <Select value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={diriSendiri}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {LABEL_ROLE[r]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Status" hint={diriSendiri ? "Akun sendiri tidak bisa ditangguhkan" : undefined}>
        <Select value={status} onChange={(e) => setStatus(e.target.value as Pengguna["status"])} disabled={diriSendiri}>
          <option value="ACTIVE">Aktif</option>
          <option value="SUSPENDED">Ditangguhkan</option>
        </Select>
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onBatal}>
          Batal
        </Button>
        <Button type="submit" disabled={sibuk || diriSendiri}>
          {sibuk ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
    </form>
  );
}

function FormPin({
  user,
  onBatal,
  onSimpan,
}: {
  user: Pengguna;
  onBatal: () => void;
  onSimpan: (pin: string | null) => Promise<void>;
}) {
  const [pin, setPin] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const jalankan = async (nilai: string | null) => {
    setSibuk(true);
    await onSimpan(nilai);
    setSibuk(false);
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void jalankan(pin);
      }}
    >
      <p className="text-sm text-muted">PIN dipakai untuk login cepat dan persetujuan Manager. Disimpan ter-hash di server.</p>
      <Field label="PIN baru" hint="4–6 digit angka">
        <Input type="password" inputMode="numeric" pattern="\d{4,6}" value={pin} onChange={(e) => setPin(e.target.value)} required autoComplete="new-password" />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        {user.punyaPin && (
          <Button type="button" variant="danger" disabled={sibuk} onClick={() => void jalankan(null)}>
            Hapus PIN
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onBatal}>
          Batal
        </Button>
        <Button type="submit" disabled={sibuk || !PIN_VALID.test(pin)}>
          Simpan PIN
        </Button>
      </div>
    </form>
  );
}
