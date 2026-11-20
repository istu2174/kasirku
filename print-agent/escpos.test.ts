import { describe, expect, it } from "vitest";
import { keAscii, keEscPos, perintahQr } from "./escpos";

describe("ESC/POS encoder", () => {
  it("diawali init ESC @ dan diakhiri cut GS V 66 0", () => {
    const b = keEscPos({ text: "TOTAL Rp92.000", width: 32, cut: true });
    expect([...b.subarray(0, 2)]).toEqual([0x1b, 0x40]);
    expect([...b.subarray(-4)]).toEqual([0x1d, 0x56, 66, 0]);
    expect(b.includes(Buffer.from("TOTAL Rp92.000\n"))).toBe(true);
  });

  it("tanpa cut tidak mengirim perintah potong", () => {
    const b = keEscPos({ text: "x", width: 48 });
    expect(b.includes(Buffer.from([0x1d, 0x56]))).toBe(false);
  });

  it("QR model 2 dengan panjang data = len + 3", () => {
    const data = "http://localhost:3000/r/abc";
    const b = perintahQr(data);
    const simpan = Buffer.from([0x1d, 0x28, 0x6b, data.length + 3, 0, 0x31, 0x50, 0x30]);
    expect(b.includes(simpan)).toBe(true);
    expect(b.includes(Buffer.from([0x1d, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0]))).toBe(true);
  });

  it("karakter non-ASCII diganti, diakritik dibuang", () => {
    expect(keAscii("Café ☕").toString("ascii")).toBe("Cafe ?");
  });
});
