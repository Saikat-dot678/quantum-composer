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
          bg: "#080b11",
          surface: "#0d131c",
          panel: "#111a26",
          raised: "#16212f",
          border: "#1f2c3d",
          borderStrong: "#2b3c52",
          text: "#e2e8f0",
          muted: "#94a3b8",
          faint: "#64748b",
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
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 0 rgba(255,255,255,.02) inset, 0 8px 30px rgba(0,0,0,.35)",
        glow: "0 0 0 1px rgba(34,211,238,.25), 0 0 24px rgba(34,211,238,.12)",
      },
    },
  },
  plugins: [],
} satisfies Config;
