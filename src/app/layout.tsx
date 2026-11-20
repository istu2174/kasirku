import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterSW } from "@/components/RegisterSW";

export const metadata: Metadata = {
  title: "KasirKu — POS Kafe, Restoran & Minimarket",
  description: "Aplikasi kasir web: order, pembayaran QRIS/VA/cash, struk otomatis.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#f3f4f8",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-full font-sans antialiased">
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
