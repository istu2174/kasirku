"use client";

import { clsx } from "clsx";
import { X } from "lucide-react";
import { useEffect } from "react";

/** Komponen dasar tema neumorphism gelap. Semua halaman wajib memakai ini. */

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={clsx("neu", className)}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-grad text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger" | "success";
  size?: "sm" | "md" | "lg";
}) {
  const gaya = {
    primary: "bg-grad-brand text-white shadow-glow hover:brightness-110",
    success: "bg-gradient-to-br from-emerald-600 to-emerald-400 text-white shadow-neu-sm hover:brightness-110",
    danger: "bg-gradient-to-br from-rose-700 to-rose-500 text-white shadow-neu-sm hover:brightness-110",
    outline: "bg-base-800 text-fg shadow-neu-sm hover:text-brand-700 active:shadow-neu-in-sm",
    ghost: "text-muted hover:bg-black/5 hover:text-fg",
  }[variant];
  // min-h 44px untuk target sentuh (PRD §10.4)
  const ukuran = {
    sm: "min-h-9 px-3 text-sm",
    md: "min-h-11 px-4 text-sm",
    lg: "min-h-14 px-6 text-base",
  }[size];
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40",
        gaya,
        ukuran,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "green" | "amber" | "red" | "blue";
}) {
  const warna = {
    neutral: "bg-black/5 text-muted ring-black/10",
    green: "bg-emerald-500/10 text-emerald-700 ring-emerald-400/20",
    amber: "bg-amber-500/10 text-amber-700 ring-amber-400/20",
    red: "bg-rose-500/10 text-rose-600 ring-rose-400/20",
    blue: "bg-brand-500/15 text-brand-700 ring-brand-400/25",
  }[tone];
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1", warna)}>
      {children}
    </span>
  );
}

const kelasInput =
  "w-full rounded-2xl bg-base-800 px-4 py-3 text-sm text-fg shadow-neu-in outline-none transition placeholder:text-muted/70 focus:ring-2 focus:ring-brand-500/60";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input {...props} className={clsx(kelasInput, className)} />;
}

export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select {...props} className={clsx(kelasInput, "appearance-none pr-8", className)}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea {...props} className={clsx(kelasInput, className)} />;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="neu p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={clsx("uang mt-2 text-2xl font-extrabold", accent ? "text-grad" : "text-fg")}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="neu-in px-4 py-10 text-center text-sm text-muted">{children}</div>;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={clsx(
          "flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-base-800 shadow-neu ring-1 ring-black/5 sm:rounded-3xl",
          wide ? "sm:max-w-3xl" : "sm:max-w-md",
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-base font-bold text-fg">{title}</h3>
          <button
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-2xl text-muted shadow-neu-sm hover:text-fg"
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Toast({ pesan, tone = "error" }: { pesan: string | null; tone?: "error" | "ok" }) {
  if (!pesan) return null;
  return (
    <div
      role="status"
      className={clsx(
        "fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-neu",
        tone === "error" ? "bg-gradient-to-br from-rose-700 to-rose-500" : "bg-grad-brand",
      )}
    >
      {pesan}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { tone: "green" | "amber" | "red" | "blue" | "neutral"; label: string }> = {
    DRAFT: { tone: "amber", label: "Draft" },
    CONFIRMED: { tone: "blue", label: "Diproses" },
    PAID: { tone: "green", label: "Lunas" },
    CANCELLED: { tone: "neutral", label: "Batal" },
    REFUNDED: { tone: "red", label: "Refund" },
    PARTIALLY_REFUNDED: { tone: "red", label: "Refund sebagian" },
    UNPAID: { tone: "amber", label: "Belum bayar" },
    PENDING: { tone: "amber", label: "Menunggu" },
    EXPIRED: { tone: "neutral", label: "Kedaluwarsa" },
    FAILED: { tone: "red", label: "Gagal" },
    NEEDS_REVIEW: { tone: "red", label: "Perlu review" },
    QUEUED: { tone: "amber", label: "Antre" },
    PRINTED: { tone: "green", label: "Tercetak" },
    SKIPPED: { tone: "neutral", label: "Tanpa printer" },
    OPEN: { tone: "green", label: "Buka" },
    CLOSED: { tone: "neutral", label: "Tutup" },
  };
  const d = map[status] ?? { tone: "neutral" as const, label: status };
  return <Badge tone={d.tone}>{d.label}</Badge>;
}
