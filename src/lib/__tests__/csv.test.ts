import { describe, expect, it } from "vitest";
import { csvKeObjek, keCsv, parseCsv } from "../../app/api/products/import/csv";

describe("parser CSV produk", () => {
  it("menangani quote, koma, kutip ganda, newline di dalam field, CRLF, dan BOM", () => {
    const teks = '﻿name,sku,price\r\n"Kopi, Susu",KS-1,18000\r\n"Teh ""Manis""\nDingin",TM-1,12000\r\n\r\n';
    expect(parseCsv(teks)).toEqual([
      ["name", "sku", "price"],
      ["Kopi, Susu", "KS-1", "18000"],
      ['Teh "Manis"\nDingin', "TM-1", "12000"],
    ]);
  });

  it("memetakan header ke objek dan mengisi kolom yang hilang dengan string kosong", () => {
    expect(csvKeObjek("Name,SKU,Barcode\nRoti,R-1\n")).toEqual([{ name: "Roti", sku: "R-1", barcode: "" }]);
  });

  it("menolak quote yang tidak ditutup", () => {
    expect(() => parseCsv('a,"b\n')).toThrow();
  });

  it("round-trip keCsv → parseCsv, dan menetralkan formula", () => {
    const csv = keCsv(["name", "price"], [["Es \"Jeruk\", besar", 15000], ["=1+1", 0]]);
    expect(parseCsv(csv)).toEqual([
      ["name", "price"],
      ['Es "Jeruk", besar', "15000"],
      ["'=1+1", "0"],
    ]);
  });
});
