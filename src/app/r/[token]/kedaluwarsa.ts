/** Struk digital berlaku 30 hari sejak terbit (PRD §9.2). */
export const MASA_BERLAKU_MS = 30 * 24 * 60 * 60 * 1000;

export const strukKedaluwarsa = (issuedAt: Date, sekarang = Date.now()) =>
  sekarang - issuedAt.getTime() > MASA_BERLAKU_MS;
