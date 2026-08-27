import type { Config } from "tailwindcss";

// "Instrument Canvas" visual system — see docs/FRONTEND_REFERENCE_STUDY.md.
// The same semantic tokens drive both themes; components should not need to
// know whether the current canvas is light or dark. CSS variables live in
// app/globals.css so SVG/CSS compatibility rules can consume the same values.
const token = (name: string) => `rgb(var(--qc-${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: token("canvas"),
          dim: token("canvas-dim"),
        },
        surface: {
          DEFAULT: token("surface"),
          raised: token("surface-raised"),
          sunken: token("surface-sunken"),
        },
        ink: {
          900: token("ink-900"),
          700: token("ink-700"),
          500: token("ink-500"),
          400: token("ink-400"),
          300: token("ink-300"),
          200: token("ink-200"),
          100: token("ink-100"),
        },
        line: {
          hairline: token("line-hairline"),
          DEFAULT: token("line"),
          strong: token("line-strong"),
        },
        accent: {
          50: token("accent-50"),
          100: token("accent-100"),
          400: token("accent-400"),
          500: token("accent-500"),
          600: token("accent-600"),
          700: token("accent-700"),
          cyan: token("accent-600"),
          green: token("safe-text"),
          amber: token("warn-text"),
          red: token("danger-text"),
        },
        safe: {
          DEFAULT: token("safe"),
          text: token("safe-text"),
          bg: token("safe-bg"),
          border: token("safe-border"),
        },
        warn: {
          DEFAULT: token("warn"),
          text: token("warn-text"),
          bg: token("warn-bg"),
          border: token("warn-border"),
        },
        danger: {
          DEFAULT: token("danger"),
          text: token("danger-text"),
          bg: token("danger-bg"),
          border: token("danger-border"),
        },
        quantum: {
          DEFAULT: token("quantum"),
          text: token("quantum-text"),
          bg: token("quantum-bg"),
          border: token("quantum-border"),
          400: token("quantum-400"),
          500: token("quantum"),
          600: token("quantum-text"),
        },
        // Compatibility layer for older leaf components. These aliases point
        // at the same theme-aware tokens rather than freezing old dark colors.
        lab: {
          bg: token("canvas"),
          surface: token("surface"),
          panel: token("surface"),
          raised: token("surface-sunken"),
          border: token("line-hairline"),
          borderStrong: token("line-strong"),
          text: token("ink-900"),
          muted: token("ink-700"),
          faint: token("ink-400"),
        },
      },
      fontFamily: {
        sans: ["var(--font-ui)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-ui)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        island: "var(--qc-shadow-island)",
        floating: "var(--qc-shadow-floating)",
        focus: "var(--qc-shadow-focus)",
        panel: "var(--qc-shadow-floating)",
        glow: "var(--qc-shadow-glow)",
      },
      borderRadius: {
        xl2: "0.875rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
