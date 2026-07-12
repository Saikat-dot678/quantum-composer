import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Quantum identity accent (used sparingly).
        quantum: { 400: "#a78bfa", 500: "#8b5cf6", 600: "#7c3aed" },
        // Dark scientific "lab instrument" surfaces.
        lab: {
          bg: "#070b10",
          surface: "#0a1017",
          panel: "#0d141d",
          raised: "#121c27",
          border: "#1b2937",
          borderStrong: "#2a3c4e",
          text: "#e6edf4",
          muted: "#9aa9b8",
          // WCAG AA: >= 4.5:1 against every lab surface (verified by the axe suite).
          faint: "#7d90a4",
        },
        // Semantic accents: cyan=quantum sim, green=safe, amber=heavy, red=infeasible.
        accent: {
          cyan: "#22d3ee",
          green: "#34d399",
          amber: "#fbbf24",
          red: "#f87171",
        },
      },
      fontFamily: {
        sans: ["var(--font-ui)", "Aptos", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Bahnschrift", "Aptos Display", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 0 rgba(255,255,255,.025) inset, 0 12px 36px rgba(0,0,0,.24)",
        glow: "0 0 0 1px rgba(34,211,238,.22), 0 0 22px rgba(34,211,238,.1)",
        signal: "0 8px 28px rgba(34,211,238,.16)",
      },
    },
  },
  plugins: [],
} satisfies Config;
