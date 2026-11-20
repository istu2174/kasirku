"use client";

/**
 * Cetak struk lewat dialog print browser (printer biasa / "Save as PDF").
 * Dipakai selama belum ada printer thermal + print agent.
 */
export function cetakDiBrowser(teks: string, judul = "Struk") {
  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) return false; // popup diblokir
  const aman = teks.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${judul.replace(/</g, "")}</title>
<style>@page{margin:4mm}body{margin:0;display:flex;justify-content:center;background:#fff}
pre{font:12px/1.45 ui-monospace,Consolas,monospace;color:#000;margin:0;padding:8px}</style></head>
<body><pre>${aman}</pre><script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)}</script></body></html>`);
  w.document.close();
  return true;
}
