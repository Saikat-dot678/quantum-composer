import type { Metadata } from "next";
import type { Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted, deterministic type system (latin subsets, ~114 KB total):
// - Archivo (variable): utilitarian grotesque for UI text.
// - Chakra Petch: squared HUD face for instrument labels, headings, and badges.
// - JetBrains Mono (variable): bitstrings, counts, memory figures, code.
const fontUi = localFont({
  src: "./fonts/archivo-var.woff2",
  weight: "100 900",
  variable: "--font-ui",
  display: "swap",
});

const fontDisplay = localFont({
  src: [
    { path: "./fonts/chakra-petch-500.woff2", weight: "500" },
    { path: "./fonts/chakra-petch-600.woff2", weight: "600" },
    { path: "./fonts/chakra-petch-700.woff2", weight: "700" },
  ],
  variable: "--font-display",
  display: "swap",
});

const fontMono = localFont({
  src: "./fonts/jetbrains-mono-var.woff2",
  weight: "100 800",
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Quantum Composer · Simulator and Cryptography Lab",
  description: "Educational visual quantum circuit composer, structure-aware multi-engine simulator, and protocol-level quantum cryptography lab.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#070b10",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fontUi.variable} ${fontDisplay.variable} ${fontMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
