export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function formatEngineName(engine: string): string {
  const names: Record<string, string> = {
    auto: "Auto router",
    aer_statevector: "Aer statevector",
    aer_mps: "Aer MPS",
    aer_stabilizer: "Aer stabilizer",
    aer_density_matrix: "Aer density matrix",
    stim_stabilizer: "Stim stabilizer",
  };
  return names[engine] ?? engine.replaceAll("_", " ");
}

export function joinBits(bits: number[], limit?: number): string {
  const value = typeof limit === "number" ? bits.slice(0, limit) : bits;
  return value.join("");
}
