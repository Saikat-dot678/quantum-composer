import type { Config } from "tailwindcss";

// "Instrument Canvas" visual system — see docs/FRONTEND_REFERENCE_STUDY.md.
// Light-first, pure-neutral gray ramp (no warm/cool tint, per the Vercel Geist
// study), a single indigo accent reserved for primary actions and selection,
// and semantic color kept strictly for feasibility/risk state — never
// decorative. This deliberately replaces the prior dark-navy/cyan "instrument
// lab" palette used across three earlier passes.
export default {
  darkMode: "media",
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: {
          // Page background: off-white, distinct from pure-white surfaces.
          DEFAULT: "#f6f6f8",
          dim: "#eeeef1",
        },
        surface: {
          // Floating islands (toolbar, dock, inspector, palette, drawers).
          DEFAULT: "#ffffff",
          raised: "#ffffff",
          sunken: "#fafafb",
        },
        ink: {
          // Text ramp: near-black to light gray, pure neutral throughout.
          // 900/700/400 are each >= 4.5:1 (WCAG AA) on `canvas`, `canvas-dim`,
          // and `surface` — safe for text anywhere. `500` only clears 4.5:1 on
          // `surface` (white, 4.83:1); it drops below AA on `canvas` (4.48:1)
          // and `canvas-dim` (4.17:1), so use `400` for text on those two.
          // `300`/`200`/`100` are for non-text use (icons, borders, disabled
          // fills) only, at any of the three backgrounds.
          900: "#18181b",
          700: "#3f3f46",
          500: "#71717a",
          400: "#63636c",
          300: "#d4d4d8",
          200: "#e4e4e7",
          100: "#f0f0f2",
        },
        line: {
          hairline: "#e7e7ea",
          DEFAULT: "#dcdce1",
          strong: "#c2c2c9",
        },
        accent: {
          50: "#eef2ff",
          100: "#e0e7ff",
          400: "#818cf8",
          500: "#6366f1",
          // 600 is the only accent shade used for text/icons (>= 4.5:1 everywhere).
          600: "#4f46e5",
          700: "#4338ca",
          // Compatibility layer: legacy "cyan=accent / green=safe / amber=warn /
          // red=danger" names, remapped onto the new AA-safe text shades.
          cyan: "#4f46e5",
          green: "#047857",
          amber: "#92400e",
          red: "#b91c1c",
        },
        // Semantic feasibility/risk color — reserved for that meaning only.
        // `text` shades are >= 4.5:1 on both their own `bg` and on `canvas`.
        safe: { DEFAULT: "#059669", text: "#047857", bg: "#ecfdf5", border: "#a7f3d0" },
        warn: { DEFAULT: "#b45309", text: "#92400e", bg: "#fffbeb", border: "#fde68a" },
        danger: { DEFAULT: "#dc2626", text: "#b91c1c", bg: "#fef2f2", border: "#fecaca" },
        // Sparing secondary hue for quantum-state visuals (Bloch/phase only).
        quantum: { DEFAULT: "#7c3aed", text: "#6d28d9", bg: "#f5f3ff", border: "#ddd6fe", 400: "#8b5cf6", 500: "#7c3aed", 600: "#6d28d9" },
        // --- Compatibility layer -------------------------------------------
        // Pre-rebuild token names, remapped onto the new light/neutral/indigo
        // palette (not the old dark values) so leaf components that have not
        // yet been individually re-authored still render correctly instead of
        // going invisible. New/rebuilt components (shell, Composer canvas,
        // Simulator Lab, Cryptography Lab) use the tokens above directly and
        // do not depend on this layer. Tracked as a follow-up in audit.md.
        lab: {
          bg: "#f6f6f8",
          surface: "#ffffff",
          panel: "#ffffff",
          raised: "#fafafb",
          border: "#e7e7ea",
          borderStrong: "#c2c2c9",
          text: "#18181b",
          muted: "#3f3f46",
          faint: "#63636c",
        },
      },
      fontFamily: {
        sans: ["var(--font-ui)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-ui)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        // "Island" elevation (Excalidraw pattern): one soft shadow, one hairline ring.
        island: "0 1px 2px rgba(24,24,27,.04), 0 8px 24px -4px rgba(24,24,27,.10), 0 0 0 1px rgba(220,220,225,.7)",
        floating: "0 4px 8px rgba(24,24,27,.06), 0 16px 40px -8px rgba(24,24,27,.16), 0 0 0 1px rgba(220,220,225,.8)",
        focus: "0 0 0 2px #ffffff, 0 0 0 4px #6366f1",
        // Compatibility layer: pre-rebuild shadow names, unused leaf components only.
        panel: "0 4px 8px rgba(24,24,27,.06), 0 16px 40px -8px rgba(24,24,27,.16), 0 0 0 1px rgba(220,220,225,.8)",
        glow: "0 0 0 3px rgba(99,102,241,.12), 0 0 16px rgba(79,70,229,.25)",
      },
      borderRadius: {
        xl2: "0.875rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
