import type { Config } from "tailwindcss";

/**
 * Tema neumorphism terang: dasar putih keabuan, aksen hitam halus.
 * Bayangan neu = gelap kanan-bawah + terang kiri-atas di atas warna dasar yang sama.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#e4e6ee",
          900: "#eceef4",
          800: "#ffffff", // permukaan kartu
          700: "#f6f7fa",
          600: "#eef0f5",
          500: "#dfe2ea",
        },
        fg: "#1c1c1f",
        muted: "#6b6b74",
        line: "rgba(0,0,0,0.08)",
        brand: {
          50: "#f6f6f7",
          100: "#ececee",
          200: "#d9d9dd",
          300: "#b5b5bc",
          400: "#8b8b94",
          500: "#5f5f68",
          600: "#3f3f46",
          700: "#2c2c32",
          800: "#1f1f23",
          900: "#18181b",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        neu: "7px 7px 16px #d5d8e2, -7px -7px 16px #ffffff",
        "neu-sm": "3px 3px 8px #d5d8e2, -3px -3px 8px #ffffff",
        "neu-in": "inset 4px 4px 10px #d5d8e2, inset -4px -4px 10px #ffffff",
        "neu-in-sm": "inset 2px 2px 5px #d5d8e2, inset -2px -2px 5px #ffffff",
        glow: "0 0 0 1px rgba(24,24,27,.08), 0 10px 24px -10px rgba(24,24,27,.45)",
        card: "7px 7px 16px #d5d8e2, -7px -7px 16px #ffffff",
      },
      backgroundImage: {
        "grad-brand": "linear-gradient(135deg, #18181b 0%, #2c2c32 55%, #3f3f46 100%)",
        "grad-soft": "linear-gradient(145deg, #ffffff 0%, #eef0f5 100%)",
        "grad-text": "linear-gradient(90deg, #18181b 0%, #2c2c32 50%, #52525b 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
