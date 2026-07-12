import type { Metadata } from "next";
import { CryptographyLab } from "@/components/crypto/CryptographyLab";

export const metadata: Metadata = {
  title: "Cryptography Lab · Quantum Composer",
  description: "Interactive, educational BB84, E91, B92, and QRNG protocol analysis with explicit security boundaries.",
};

export default function CryptoPage() {
  return <CryptographyLab />;
}
