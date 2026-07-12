export type Mode = "composer" | "simulator" | "crypto";

export const MODE_LABELS: Record<Mode, string> = {
  composer: "Circuit Composer",
  simulator: "Simulator Lab",
  crypto: "Cryptography Lab",
};

export const MODE_TAGLINES: Record<Mode, string> = {
  composer: "Design circuits with live state feedback and honest feasibility.",
  simulator: "Analyze structure, compare engines, and run what is actually tractable.",
  crypto: "Trace QKD protocols and quantum randomness as educational models.",
};

export type BackendStatus = "checking" | "online" | "offline";
