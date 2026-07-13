import { describe, expect, it } from "vitest";
import {
  complexMagnitude,
  complexPhaseRadians,
  diracNotation,
  displayEntries,
  formatComplex,
  formatPhaseDegrees,
  formatPhaseRadians,
  formatProbabilityPercent,
  isApproximate,
  magnitudeToHeatmapColor,
  phaseToHslColor,
  qubitOrderLabel,
  representationLabel,
  semanticPointLabel,
  stateAnalysisToCsv,
  stateAnalysisToJson,
} from "./stateAnalysisFormat";
import type { AmplitudeEntry, StateAnalysisResponse } from "./labTypes";

describe("formatComplex", () => {
  it("formats a pure real number without an imaginary term", () => {
    expect(formatComplex({ re: 0.7071, im: 0 })).toBe("0.7071");
  });
  it("formats a pure imaginary number without a real term", () => {
    expect(formatComplex({ re: 0, im: 1 })).toBe("1i");
  });
  it("formats a mixed complex number with an explicit sign", () => {
    expect(formatComplex({ re: 0.5, im: -0.5 })).toBe("0.5-0.5i");
    expect(formatComplex({ re: 0.5, im: 0.5 })).toBe("0.5+0.5i");
  });
});

describe("formatProbabilityPercent / formatPhaseDegrees / formatPhaseRadians", () => {
  it("formats a probability as a percentage", () => {
    expect(formatProbabilityPercent(0.5)).toBe("50.00%");
  });
  it("formats phase in degrees and radians", () => {
    expect(formatPhaseDegrees(90)).toBe("90.0°");
    expect(formatPhaseRadians(Math.PI)).toBe("3.142 rad");
  });
});

describe("phaseToHslColor", () => {
  it("wraps negative and large angles into 0..360 hue range", () => {
    const color = phaseToHslColor(-Math.PI / 2);
    const hue = Number(color.match(/hsl\(([\d.]+),/)![1]);
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
  });
  it("maps 0 radians to hue 0", () => {
    expect(phaseToHslColor(0)).toContain("hsl(0.0,");
  });
});

describe("semanticPointLabel / representationLabel", () => {
  it("labels every semantic point", () => {
    expect(semanticPointLabel("final_state")).toBe("Final state");
    expect(semanticPointLabel("pre_measurement_state")).toBe("Pre-measurement state");
    expect(semanticPointLabel("mixed_final_state")).toBe("Final state (mixed)");
    expect(semanticPointLabel(null)).toBe("Unknown");
  });
  it("labels every representation and falls back gracefully for unknown ones", () => {
    expect(representationLabel("statevector")).toContain("Statevector");
    expect(representationLabel("stabilizer_summary")).toContain("Stabilizer");
    expect(representationLabel(null)).toBe("Unavailable");
  });
});

describe("qubitOrderLabel", () => {
  it("expands the known backend qubit-order identifier", () => {
    expect(qubitOrderLabel("qiskit_little_endian_q0_lsb")).toContain("least significant bit");
  });
  it("falls back to the raw identifier for an unknown value", () => {
    expect(qubitOrderLabel("some_future_order")).toBe("some_future_order");
  });
});

function amp(basis: string, re: number, im: number, probability: number, phaseRadians = 0): AmplitudeEntry {
  return { index: null, basis, amplitude: { re, im }, probability, phase_radians: phaseRadians, phase_degrees: (phaseRadians * 180) / Math.PI };
}

describe("diracNotation", () => {
  it("renders a real positive-amplitude Bell state", () => {
    const text = diracNotation([amp("00", 0.7071, 0, 0.5), amp("11", 0.7071, 0, 0.5)]);
    expect(text).toBe("0.7071|00⟩ + 0.7071|11⟩");
  });

  it("renders a negative real amplitude with an explicit minus sign", () => {
    const text = diracNotation([amp("0", 0.7071, 0, 0.5), amp("1", -0.7071, 0, 0.5)]);
    expect(text).toBe("0.7071|0⟩ + -0.7071|1⟩");
  });

  it("renders a complex amplitude using magnitude/phase form", () => {
    const text = diracNotation([amp("1", 0, 1, 1.0, Math.PI / 2)]);
    expect(text).toContain("e^{i1.57}");
  });

  it("truncates to maxTerms and notes how many were omitted", () => {
    const entries = Array.from({ length: 5 }, (_, i) => amp(String(i), 0.4, 0, 0.16));
    const text = diracNotation(entries, 2);
    expect(text).toContain("…(3 more)");
  });

  it("returns an empty string for no amplitude data (e.g. a stabilizer summary)", () => {
    expect(diracNotation([{ index: null, basis: "00", amplitude: null, probability: 0.5, phase_radians: null, phase_degrees: null }])).toBe("");
  });
});

describe("isApproximate", () => {
  const base: StateAnalysisResponse = {
    available: true,
    representation: "statevector",
    source_engine: "aer_mps",
    semantic_point: "final_state",
    qubit_order: "qiskit_little_endian_q0_lsb",
    num_qubits: 2,
    normalized: true,
    normalization_error: 0,
    amplitudes: null,
    density_matrix: null,
    basis_probabilities: null,
    top_states: null,
    per_qubit: null,
    entanglement: null,
    global_metrics: null,
    warnings: [],
    unavailable_reason: null,
  };

  it("detects an approximation warning", () => {
    expect(isApproximate({ ...base, warnings: ["The displayed state may be approximate."] })).toBe(true);
  });
  it("is false with no matching warning", () => {
    expect(isApproximate({ ...base, warnings: ["Some unrelated note."] })).toBe(false);
  });
});

describe("complexMagnitude / complexPhaseRadians", () => {
  it("computes magnitude and phase for a unit imaginary number", () => {
    expect(complexMagnitude({ re: 0, im: 1 })).toBeCloseTo(1);
    expect(complexPhaseRadians({ re: 0, im: 1 })).toBeCloseTo(Math.PI / 2);
  });
  it("computes magnitude for a 3-4-5 triangle", () => {
    expect(complexMagnitude({ re: 3, im: 4 })).toBeCloseTo(5);
  });
});

describe("magnitudeToHeatmapColor", () => {
  it("is lightest at magnitude 0 and darkest at magnitude 1", () => {
    expect(magnitudeToHeatmapColor(0)).toBe("hsl(190, 70%, 92%)");
    expect(magnitudeToHeatmapColor(1)).toBe("hsl(190, 70%, 37%)");
  });
  it("clamps out-of-range magnitudes instead of producing an invalid color", () => {
    expect(magnitudeToHeatmapColor(-0.5)).toBe(magnitudeToHeatmapColor(0));
    expect(magnitudeToHeatmapColor(1.5)).toBe(magnitudeToHeatmapColor(1));
  });
  it("darkens monotonically as magnitude increases", () => {
    const lightnessOf = (color: string) => Number(color.match(/, (\d+(?:\.\d+)?)%\)/)![1]);
    expect(lightnessOf(magnitudeToHeatmapColor(0.25))).toBeGreaterThan(lightnessOf(magnitudeToHeatmapColor(0.75)));
  });
});

describe("displayEntries", () => {
  const base: StateAnalysisResponse = {
    available: true,
    representation: "statevector",
    source_engine: "aer_statevector",
    semantic_point: "final_state",
    qubit_order: "qiskit_little_endian_q0_lsb",
    num_qubits: 1,
    normalized: true,
    normalization_error: 0,
    amplitudes: null,
    density_matrix: null,
    basis_probabilities: null,
    top_states: null,
    per_qubit: null,
    entanglement: null,
    global_metrics: null,
    warnings: [],
    unavailable_reason: null,
  };

  it("prefers amplitudes over top_states and basis_probabilities", () => {
    const amplitudes = [amp("0", 1, 0, 1)];
    const topStates = [amp("0", 1, 0, 1), amp("1", 0, 0, 0)];
    expect(displayEntries({ ...base, amplitudes, top_states: topStates })).toBe(amplitudes);
  });

  it("falls back to top_states when amplitudes is absent", () => {
    const topStates = [amp("0", 1, 0, 1)];
    expect(displayEntries({ ...base, top_states: topStates })).toBe(topStates);
  });

  it("falls back to basis_probabilities (e.g. a stabilizer summary) when both are absent", () => {
    const basisProbabilities = [{ index: null, basis: "00", amplitude: null, probability: 0.5, phase_radians: null, phase_degrees: null }];
    expect(displayEntries({ ...base, basis_probabilities: basisProbabilities })).toBe(basisProbabilities);
  });

  it("returns null when no per-basis list exists", () => {
    expect(displayEntries(base)).toBeNull();
  });
});

describe("stateAnalysisToJson / stateAnalysisToCsv", () => {
  const state: StateAnalysisResponse = {
    available: true,
    representation: "statevector",
    source_engine: "aer_statevector",
    semantic_point: "final_state",
    qubit_order: "qiskit_little_endian_q0_lsb",
    num_qubits: 1,
    normalized: true,
    normalization_error: 0,
    amplitudes: [amp("0", 1, 0, 1)],
    density_matrix: null,
    basis_probabilities: null,
    top_states: null,
    per_qubit: null,
    entanglement: null,
    global_metrics: { purity: 1 },
    warnings: [],
    unavailable_reason: null,
  };

  it("includes a schema version and the full state in the JSON export", () => {
    const json = JSON.parse(stateAnalysisToJson(state));
    expect(json.schemaVersion).toBe(1);
    expect(json.state.representation).toBe("statevector");
    expect(typeof json.exportedAt).toBe("string");
  });

  it("produces a CSV with a header and one row per amplitude", () => {
    const csv = stateAnalysisToCsv(state);
    const lines = csv!.split("\n");
    expect(lines[0]).toBe("index,basis,probability,amplitude_re,amplitude_im,phase_radians,phase_degrees");
    expect(lines).toHaveLength(2);
  });

  it("returns null for CSV export when there is no per-basis-state table", () => {
    expect(stateAnalysisToCsv({ ...state, amplitudes: null })).toBeNull();
  });
});
