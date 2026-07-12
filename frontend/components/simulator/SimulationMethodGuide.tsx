import { LIMITS } from "@/lib/constants";
import type { CircuitAnalysis, EnginesResponse } from "@/lib/labTypes";
import { Badge, Callout, Panel, SectionHeader, type BadgeTone } from "../ui/primitives";

type Verdict = { tone: BadgeTone; label: string; note: string };

interface MethodRow {
  name: string;
  scaling: string;
  bestFor: string;
  verdict: Verdict;
  available: boolean | null;
}

const PENDING: Verdict = { tone: "neutral", label: "awaiting analysis", note: "Load or analyze a circuit to evaluate compatibility." };

// Compatibility verdicts for the *current* circuit, derived from the backend
// analysis. This mirrors (never replaces) the router's own rules.
function buildRows(analysis: CircuitAnalysis | null, engines: EnginesResponse | null): MethodRow[] {
  const catalog = new Map((engines?.engines ?? []).map((entry) => [entry.id, entry]));
  const availability = (id: string): boolean | null => (engines ? (catalog.get(id as never)?.available ?? false) : null);

  const statevector = (): Verdict => {
    if (!analysis) return PENDING;
    if (analysis.num_qubits > LIMITS.simulation.statevectorHardCapQubits) {
      return { tone: "red", label: "incompatible", note: `${analysis.num_qubits} qubits exceed the ${LIMITS.simulation.statevectorHardCapQubits}-qubit hard cap (needs ${analysis.estimated_statevector_memory_human}).` };
    }
    if (analysis.statevector_risk === "safe") return { tone: "green", label: "compatible", note: `Exact simulation fits comfortably (${analysis.estimated_statevector_memory_human}).` };
    if (analysis.statevector_risk === "heavy") return { tone: "amber", label: "heavy", note: `Feasible but memory-hungry (${analysis.estimated_statevector_memory_human}).` };
    return { tone: "red", label: "infeasible", note: `Needs ${analysis.estimated_statevector_memory_human}; the router will refuse this path.` };
  };

  const density = (): Verdict => {
    if (!analysis) return PENDING;
    if (analysis.num_qubits > LIMITS.simulation.densityMatrixHardCapQubits) {
      return { tone: "red", label: "incompatible", note: `${analysis.num_qubits} qubits exceed the ${LIMITS.simulation.densityMatrixHardCapQubits}-qubit density-matrix cap (16·4ⁿ bytes).` };
    }
    if (analysis.density_matrix_risk === "safe" || analysis.density_matrix_risk === "heavy") {
      return { tone: "green", label: "compatible", note: `Noise-capable at ${analysis.estimated_density_matrix_memory_human}.` };
    }
    return { tone: "red", label: "infeasible", note: `Needs ${analysis.estimated_density_matrix_memory_human}.` };
  };

  const stabilizer = (): Verdict => {
    if (!analysis) return PENDING;
    if (analysis.is_clifford) return { tone: "green", label: "compatible", note: `Clifford-only circuit: scales polynomially even at ${analysis.num_qubits} qubits.` };
    return { tone: "red", label: "incompatible", note: `Non-Clifford content (T-count ${analysis.t_count}, rotations ${analysis.rotation_count}) breaks the stabilizer formalism.` };
  };

  const mps = (): Verdict => {
    if (!analysis) return PENDING;
    if (analysis.is_clifford) return { tone: "neutral", label: "unnecessary", note: "Stabilizer methods already handle this circuit exactly." };
    if (analysis.statevector_risk === "safe") return { tone: "neutral", label: "unnecessary", note: "Exact statevector is already comfortable at this size." };
    return { tone: "amber", label: "structure-dependent", note: "Only accurate if entanglement stays low; enable approximation to let Auto try it." };
  };

  const hardware = (): Verdict => {
    if (!analysis) return PENDING;
    if (analysis.feasibility_status === "approximation_or_hardware") {
      return { tone: "amber", label: "recommended", note: "No classical engine handles this circuit exactly; a physical QPU is the honest alternative." };
    }
    return { tone: "neutral", label: "not needed", note: "A classical engine can handle this circuit." };
  };

  return [
    { name: "Statevector", scaling: "16 × 2ⁿ bytes", bestFor: "Small arbitrary circuits, richest exact output.", verdict: statevector(), available: availability("aer_statevector") },
    { name: "Stabilizer", scaling: "polynomial in n", bestFor: "Large Clifford circuits (Gottesman–Knill).", verdict: stabilizer(), available: availability("aer_stabilizer") },
    { name: "Matrix product state", scaling: "bond-dimension bound", bestFor: "Wide, low-entanglement circuits.", verdict: mps(), available: availability("aer_mps") },
    { name: "Density matrix", scaling: "16 × 4ⁿ bytes", bestFor: "Small noisy circuits.", verdict: density(), available: availability("aer_density_matrix") },
    { name: "Real quantum hardware", scaling: "physical system", bestFor: "Beyond feasible classical simulation.", verdict: hardware(), available: null },
  ];
}

export function SimulationMethodGuide({ analysis, engines }: { analysis: CircuitAnalysis | null; engines: EnginesResponse | null }) {
  const rows = buildRows(analysis, engines);
  return (
    <Panel className="p-4">
      <SectionHeader
        eyebrow="Engine comparison"
        title="Methods vs this circuit"
        description={analysis
          ? `Compatibility computed for the active ${analysis.num_qubits}-qubit, ${analysis.operation_count}-operation circuit.`
          : "Qubit count alone does not determine feasibility. Verdicts appear once a circuit is analyzed."}
      />

      <div className="space-y-2.5">
        {rows.map((row) => (
          <article key={row.name} className={`rounded-lg border p-3 transition-colors ${row.verdict.tone === "green" ? "border-accent-green/30 bg-accent-green/[.04]" : row.verdict.tone === "red" ? "border-lab-border bg-lab-raised/25 opacity-80" : "border-lab-border bg-lab-raised/35"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-lab-text">{row.name}</h3>
              <span className="flex items-center gap-1.5">
                {row.available === false && <Badge tone="neutral">not installed</Badge>}
                <Badge tone={row.verdict.tone}>{row.verdict.label}</Badge>
              </span>
            </div>
            <p className="mt-1.5 font-mono text-[11px] leading-4 text-accent-cyan/85">{row.scaling}</p>
            <p className="mt-1 text-[11px] leading-4 text-lab-muted"><span className="font-semibold text-lab-text">Best for:</span> {row.bestFor}</p>
            <p className="mt-1 text-[11px] leading-4 text-lab-faint">{row.verdict.note}</p>
          </article>
        ))}
      </div>

      <div className="mt-3">
        <Callout tone="warning" title="No universal 100-qubit promise">
          100+ qubits are credible only for structured workloads such as Clifford/stabilizer circuits or some low-entanglement MPS candidates. Arbitrary 100-qubit statevector simulation is infeasible.
        </Callout>
      </div>
    </Panel>
  );
}
