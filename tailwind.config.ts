import type { Config } from "tailwindcss";

/**
 * Tema neumorphism gelap: dasar hitam keunguan, aksen gradasi ungu → putih.
 * Bayangan neu = gelap kanan-bawah + terang kiri-atas di atas warna dasar yang sama.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#0b0910",
          900: "#110e17",
          800: "#16131d", // latar utama
          700: "#1c1825",
          600: "#241f2f",
          500: "#2e283b",
        },
        fg: "#ece9f5",
        muted: "#9a93ad",
        line: "rgba(255,255,255,0.06)",
        brand: {
          50: "#f6f1ff",
          100: "#ede4ff",
          200: "#dccbff",
          300: "#c4a6ff",
          400: "#a879ff",
          500: "#9150fb",
          600: "#7c3aed",
          700: "#6a2bd0",
          800: "#5823a8",
          900: "#461d85",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        neu: "7px 7px 16px #0a0810, -7px -7px 16px #221d2d",
        "neu-sm": "3px 3px 8px #0a0810, -3px -3px 8px #221d2d",
        "neu-in": "inset 4px 4px 10px #0a0810, inset -4px -4px 10px #221d2d",
        "neu-in-sm": "inset 2px 2px 5px #0a0810, inset -2px -2px 5px #221d2d",
        glow: "0 0 0 1px rgba(196,166,255,.25), 0 10px 28px -8px rgba(124,58,237,.7)",
        card: "7px 7px 16px #0a0810, -7px -7px 16px #221d2d",
      },
      backgroundImage: {
        "grad-brand": "linear-gradient(135deg, #6a2bd0 0%, #9150fb 50%, #c4a6ff 100%)",
        "grad-soft": "linear-gradient(145deg, #1c1825 0%, #120f18 100%)",
        "grad-text": "linear-gradient(90deg, #ffffff 0%, #dccbff 45%, #a879ff 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
