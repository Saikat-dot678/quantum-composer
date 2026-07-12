import { isProtocol, type Protocol } from "./config";

export interface CryptoPreferences {
  protocol: Protocol;
  numBits: number;
  eveEnabled: boolean;
  channelError: number;
  seed: number | "";
}

export const DEFAULT_CRYPTO_PREFERENCES: CryptoPreferences = {
  protocol: "bb84",
  numBits: 256,
  eveEnabled: false,
  channelError: 0.02,
  seed: 123,
};

const STORAGE_KEY = "quantum-composer.crypto-preferences.v1";

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeCryptoPreferences(value: unknown): CryptoPreferences {
  if (!value || typeof value !== "object") return DEFAULT_CRYPTO_PREFERENCES;
  const record = value as Record<string, unknown>;
  const protocol = isProtocol(record.protocol) ? record.protocol : DEFAULT_CRYPTO_PREFERENCES.protocol;
  const maxBits = protocol === "qrng" ? 8192 : 4096;
  const rawSeed = record.seed;
  const seed = rawSeed === ""
    ? ""
    : Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(finiteNumber(rawSeed, DEFAULT_CRYPTO_PREFERENCES.seed as number))));

  return {
    protocol,
    numBits: Math.max(16, Math.min(maxBits, Math.trunc(finiteNumber(record.numBits, DEFAULT_CRYPTO_PREFERENCES.numBits)))),
    eveEnabled: typeof record.eveEnabled === "boolean" ? record.eveEnabled : DEFAULT_CRYPTO_PREFERENCES.eveEnabled,
    channelError: Math.max(0, Math.min(0.5, finiteNumber(record.channelError, DEFAULT_CRYPTO_PREFERENCES.channelError))),
    seed,
  };
}

export function loadCryptoPreferences(): CryptoPreferences {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_CRYPTO_PREFERENCES;
    return normalizeCryptoPreferences(JSON.parse(stored));
  } catch {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can be unavailable in hardened/private browser contexts.
    }
    return DEFAULT_CRYPTO_PREFERENCES;
  }
}

export function saveCryptoPreferences(preferences: CryptoPreferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeCryptoPreferences(preferences)));
  } catch {
    // Preferences are a convenience; simulations remain fully usable without storage.
  }
}
