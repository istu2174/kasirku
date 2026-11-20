/** Matriks hak akses (PRD §4). Dipakai di server, bukan hanya menyembunyikan tombol. */

export type Role = "OWNER" | "MANAGER" | "KASIR" | "DAPUR" | "GUDANG";

export const ROLES: Role[] = ["OWNER", "MANAGER", "KASIR", "DAPUR", "GUDANG"];

export type Permission =
  | "dashboard.view"
  | "order.create"
  | "order.void"
  | "product.edit"
  | "shift.manage"
  | "stock.opname"
  | "user.manage"
  | "report.view"
  | "kds.view"
  | "settings.manage"
  | "audit.view";

const MATRIX: Record<Permission, Role[]> = {
  "dashboard.view": ["OWNER", "MANAGER"],
  "order.create": ["OWNER", "MANAGER", "KASIR"],
  "order.void": ["OWNER", "MANAGER"],
  "product.edit": ["OWNER", "MANAGER"],
  "shift.manage": ["OWNER", "MANAGER", "KASIR"],
  "stock.opname": ["OWNER", "MANAGER", "GUDANG"],
  "user.manage": ["OWNER"],
  "report.view": ["OWNER", "MANAGER"],
  "kds.view": ["OWNER", "MANAGER", "KASIR", "DAPUR"],
  "settings.manage": ["OWNER", "MANAGER"],
  "audit.view": ["OWNER", "MANAGER"],
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[permission].includes(role);
}

export const LABEL_ROLE: Record<Role, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  KASIR: "Kasir",
  DAPUR: "Dapur",
  GUDANG: "Staf Gudang",
};

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Lempar 403 kalau role tidak berhak. Dipakai di setiap route API. */
export function wajibIzin(role: Role | null | undefined, permission: Permission) {
  if (!can(role, permission)) {
    throw new HttpError(403, "Anda tidak punya akses untuk aksi ini");
  }
}
