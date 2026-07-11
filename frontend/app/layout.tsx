import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Quantum Composer Lite", description: "An educational visual circuit builder powered by Qiskit." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
