export type Protocol = "bb84" | "e91" | "b92" | "qrng";

export interface ProtocolDefinition {
  id: Protocol;
  name: string;
  subtitle: string;
  summary: string;
  teaches: string;
  securityNote: string;
  steps: string[];
}

export const PROTOCOLS: ProtocolDefinition[] = [
  {
    id: "bb84",
    name: "BB84",
    subtitle: "Prepare-and-measure QKD · 1984",
    summary: "Alice encodes random bits in Z or X bases. Bob measures independently, then both parties keep only matching bases.",
    teaches: "Basis reconciliation, key sifting, QBER, privacy amplification, and intercept-resend disturbance.",
    securityNote: "An elevated QBER means this educational channel is disturbed or insecure. It is not proof that a particular eavesdropper exists.",
    steps: ["Alice prepares", "Quantum channel", "Bob measures", "Sift + estimate QBER"],
  },
  {
    id: "e91",
    name: "E91",
    subtitle: "Entanglement + CHSH · 1991",
    summary: "Alice and Bob measure simulated singlet pairs at independent angles; matching settings form a key and other settings estimate CHSH correlations.",
    teaches: "Entanglement correlations, the CHSH classical bound, finite-sample variation, QBER, and attack disturbance.",
    securityNote: "The displayed CHSH value is a protocol-level simulated indicator. It does not certify a physical source, channel, or device.",
    steps: ["Pair source", "Choose angles", "Measure pairs", "CHSH + key sift"],
  },
  {
    id: "b92",
    name: "B92",
    subtitle: "Two non-orthogonal states · 1992",
    summary: "Alice uses only |0⟩ and |+⟩. Bob keeps outcomes that rule out one state and discards inconclusive measurements.",
    teaches: "Non-orthogonal encoding, conclusive measurements, sifting efficiency, and channel-error effects.",
    securityNote: "This model illustrates protocol statistics only; it is not a complete security proof or production key-distribution system.",
    steps: ["Alice prepares", "Two-state channel", "Bob tests", "Keep conclusive bits"],
  },
  {
    id: "qrng",
    name: "QRNG",
    subtitle: "Hadamard measurement · educational",
    summary: "Each sample models preparing H|0⟩ and measuring it to obtain an ideally balanced classical bit.",
    teaches: "Finite-sample 0/1 distributions and a simple bias diagnostic.",
    securityNote: "This simulator uses a seeded pseudo-random generator for reproducibility. It is not certified hardware randomness or a source of cryptographic entropy.",
    steps: ["Prepare |0⟩", "Apply H", "Measure", "Inspect distribution"],
  },
];

export function getProtocolDefinition(protocol: Protocol): ProtocolDefinition {
  return PROTOCOLS.find((item) => item.id === protocol) ?? PROTOCOLS[0];
}
