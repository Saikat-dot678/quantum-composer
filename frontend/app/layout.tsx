import type { Metadata } from "next";
import type { Viewport } from "next";
import localFont from "next/font/local";
import { ActionRegistryProvider } from "@/components/workspace/ActionRegistry";
import { MotionRoot } from "@/components/workspace/MotionRoot";
import { ThemeProvider } from "@/components/workspace/ThemeProvider";
import { ToastProvider } from "@/components/workspace/ToastProvider";
import { WorkspaceProvider } from "@/components/workspace/WorkspaceProvider";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import "./globals.css";

// Self-hosted, deterministic type system (latin subsets):
// - Archivo (variable): the sole UI/display grotesque — one confident family
//   at varying weight, not a separate "HUD" face for headings.
// - JetBrains Mono (variable): bitstrings, counts, memory figures, code only.
const fontUi = localFont({
  src: "./fonts/archivo-var.woff2",
  weight: "100 900",
  variable: "--font-ui",
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
  colorScheme: "light dark",
};

const themeBootScript = `(() => {
  try {
    const stored = localStorage.getItem("quantum-composer.theme.v1");
    const preference = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    const resolved = preference === "system"
      ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : preference;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fontUi.variable} ${fontMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <ThemeProvider>
          <MotionRoot>
            <WorkspaceProvider>
              <ToastProvider>
                <ActionRegistryProvider>
                  <WorkspaceShell>{children}</WorkspaceShell>
                </ActionRegistryProvider>
              </ToastProvider>
            </WorkspaceProvider>
          </MotionRoot>
        </ThemeProvider>
      </body>
    </html>
  );
}
