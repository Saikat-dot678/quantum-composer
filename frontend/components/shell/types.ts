export type Mode = "composer" | "simulator" | "crypto";

export const MODE_LABELS: Record<Mode, string> = {
  composer: "Composer",
  simulator: "Simulator",
  crypto: "Cryptography",
};

export type BackendStatus = "checking" | "online" | "offline";
