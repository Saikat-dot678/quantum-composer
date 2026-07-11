import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Quantum Composer", description: "Educational quantum circuit composer, multi-engine simulator, and quantum cryptography lab." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
