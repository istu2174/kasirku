"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { Delete } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Field, Input } from "@/components/ui";

const DEMO = [
  { email: "owner@kasirku.id", pass: "owner123", label: "Owner" },
  { email: "manager@kasirku.id", pass: "manager123", label: "Manager" },
  { email: "kasir@kasirku.id", pass: "kasir123", label: "Kasir" },
  { email: "dapur@kasirku.id", pass: "dapur123", label: "Dapur" },
  { email: "gudang@kasirku.id", pass: "gudang123", label: "Gudang" },
];

type PinInfo = { outlet: { id: string; name: string } | null; users: { id: string; name: string; role: string }[] };

function FormLogin() {
  const params = useSearchParams();
  const [mode, setMode] = useState<"pin" | "email">("email");
  const dev = process.env.NODE_ENV !== "production";
  const [email, setEmail] = useState(dev ? "kasir@kasirku.id" : "");
  const [password, setPassword] = useState(dev ? "kasir123" : "");
  const [pinInfo, setPinInfo] = useState<PinInfo | null>(null);
  const [userPin, setUserPin] = useState<string>("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<PinInfo>("/api/auth/pin")
      .then((d) => {
        setPinInfo(d);
        if (d.users.length) {
          setMode("pin");
          setUserPin(d.users[0].id);
        }
      })
      .catch(() => setPinInfo({ outlet: null, users: [] }));
  }, []);

  function lanjut() {
    const next = params.get("next");
    // Full navigation: layout server membaca cookie sesi baru & redirect sesuai role berjalan bersih.
    window.location.assign(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
  }

  async function masukEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      lanjut();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal masuk");
    } finally {
      setLoading(false);
    }
  }

  async function masukPin(nilai: string) {
    setLoading(true);
    setError(null);
    try {
      await api("/api/auth/pin", { method: "POST", body: JSON.stringify({ userId: userPin, pin: nilai }) });
      lanjut();
    } catch (err) {
      setError(err instanceof Error ? err.message : "PIN salah");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  function tekan(d: string) {
    if (loading) return;
    const baru = (pin + d).slice(0, 6);
    setPin(baru);
  }

  return (
    <div className="neu w-full max-w-md p-6 sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-grad-brand text-2xl shadow-glow">🧾</div>
        <div>
          <h1 className="text-grad text-2xl font-extrabold">KasirKu</h1>
          <p className="text-xs text-muted">POS Kafe · Restoran · Minimarket</p>
        </div>
      </div>

      <div className="neu-in mb-6 grid grid-cols-2 gap-1 p-1">
        {(["pin", "email"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={clsx(
              "min-h-11 rounded-xl text-sm font-bold transition",
              mode === m ? "bg-grad-brand text-white shadow-glow" : "text-muted hover:text-fg",
            )}
          >
            {m === "pin" ? "PIN Kasir" : "Email & Password"}
          </button>
        ))}
      </div>

      {mode === "email" ? (
        <form onSubmit={masukEmail} className="space-y-4">
          <Field label="Email">
            <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? "Memproses…" : "Masuk"}
          </Button>
          {process.env.NODE_ENV !== "production" && (
          <div className="pt-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Akun demo</p>
            <div className="flex flex-wrap gap-2">
              {DEMO.map((d) => (
                <button
                  type="button"
                  key={d.email}
                  onClick={() => {
                    setEmail(d.email);
                    setPassword(d.pass);
                  }}
                  className="min-h-9 rounded-xl px-3 text-xs font-semibold text-muted shadow-neu-sm hover:text-brand-200"
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          )}
        </form>
      ) : !pinInfo?.users.length ? (
        <p className="neu-in p-4 text-sm text-muted">
          Perangkat ini belum terdaftar. Login sekali dengan email &amp; password, setelah itu kasir bisa masuk cepat
          dengan PIN.
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-center text-xs text-muted">Outlet: {pinInfo.outlet?.name}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {pinInfo.users.map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  setUserPin(u.id);
                  setPin("");
                }}
                className={clsx(
                  "min-h-11 rounded-2xl px-4 text-sm font-semibold transition",
                  userPin === u.id ? "bg-base-800 text-brand-200 shadow-neu-in" : "text-muted shadow-neu-sm",
                )}
              >
                {u.name} <span className="text-[10px] uppercase opacity-70">{u.role}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-center gap-3 py-2" aria-label={`PIN ${pin.length} digit`}>
            {Array.from({ length: 6 }).map((_, i) => (
              <span
                key={i}
                className={clsx("h-3.5 w-3.5 rounded-full", i < pin.length ? "bg-grad-brand shadow-glow" : "shadow-neu-in-sm")}
              />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button key={d} onClick={() => tekan(d)} className="neu h-16 rounded-2xl text-xl font-bold active:shadow-neu-in">
                {d}
              </button>
            ))}
            <button onClick={() => setPin("")} className="h-16 rounded-2xl text-sm font-semibold text-muted">
              Hapus
            </button>
            <button onClick={() => tekan("0")} className="neu h-16 rounded-2xl text-xl font-bold active:shadow-neu-in">
              0
            </button>
            <button
              onClick={() => setPin(pin.slice(0, -1))}
              className="grid h-16 place-items-center rounded-2xl text-muted"
              aria-label="Hapus satu digit"
            >
              <Delete size={20} />
            </button>
          </div>
          <Button size="lg" className="w-full" disabled={loading || pin.length < 4} onClick={() => masukPin(pin)}>
            {loading ? "Memproses…" : "Masuk dengan PIN"}
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <Suspense>
        <FormLogin />
      </Suspense>
    </main>
  );
}
