export type Protocol = "bb84" | "e91" | "b92" | "qrng";

export interface ProtocolDefinition {
  id: Protocol;
  name: string;
  shortLabel: string;
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
    shortLabel: "Prepare + measure",
    subtitle: "Basis sifting · 1984",
    summary: "Follow each prepared state from Alice through a noisy channel to Bob, then reconcile bases and estimate QBER.",
    teaches: "State preparation, basis reconciliation, key sifting, QBER, and intercept–resend disturbance.",
    securityNote: "Elevated QBER indicates a disturbed or unsuitable modeled channel. It does not identify a particular eavesdropper.",
    steps: ["Prepare states", "Transmit qubits", "Measure", "Reconcile bases"],
  },
  {
    id: "e91",
    name: "E91",
    shortLabel: "Entangled pairs",
    subtitle: "CHSH correlations · 1991",
    summary: "Route simulated singlet pairs to independently chosen analyzers, sift matched angles, and inspect a finite-sample CHSH indicator.",
    teaches: "Entanglement correlations, angle selection, the CHSH classical bound, finite-sample variation, and QBER.",
    securityNote: "A software-model CHSH value cannot certify a physical source, detectors, channel, or device independence.",
    steps: ["Emit singlet pairs", "Choose analyzers", "Measure pairs", "Test + sift"],
  },
  {
    id: "b92",
    name: "B92",
    shortLabel: "Two-state channel",
    subtitle: "Conclusive outcomes · 1992",
    summary: "Trace two non-orthogonal states and keep only Bob’s measurements that logically rule out one preparation.",
    teaches: "Non-orthogonal encoding, conclusive measurements, sifting efficiency, and retained-bit errors.",
    securityNote: "This protocol-level statistics model is not a complete security proof or a deployable key-distribution implementation.",
    steps: ["Encode |0⟩ or |+⟩", "Transmit state", "Test in Z or X", "Keep conclusions"],
  },
  {
    id: "qrng",
    name: "QRNG",
    shortLabel: "Sample measurements",
    subtitle: "Hadamard model · educational",
    summary: "Inspect a reproducible sample from the idealized H|0⟩ measurement workflow and compare it with a 50/50 distribution.",
    teaches: "Finite-sample bit distributions, observed bias, and the difference between a model and certified entropy.",
    securityNote: "The backend uses a pseudo-random generator, optionally seeded. These bits are not certified quantum entropy or cryptographic key material.",
    steps: ["Prepare |0⟩", "Apply Hadamard", "Measure", "Audit distribution"],
  },
];

export function isProtocol(value: unknown): value is Protocol {
  return typeof value === "string" && PROTOCOLS.some((item) => item.id === value);
}

export function getProtocolDefinition(protocol: Protocol): ProtocolDefinition {
  return PROTOCOLS.find((item) => item.id === protocol) ?? PROTOCOLS[0];
}
