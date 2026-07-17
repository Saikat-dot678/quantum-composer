export type Mode = "composer" | "simulator" | "hardware" | "crypto";

export const MODE_LABELS: Record<Mode, string> = {
  composer: "Composer",
  simulator: "Simulator",
  hardware: "Hardware",
  crypto: "Cryptography",
};

export type BackendStatus = "checking" | "online" | "offline";
