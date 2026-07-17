// Client-side, read-only Qiskit-style code preview for a custom gate
// definition — shown in the creation wizard so a definition's eventual
// generated code is never a surprise. This is a *preview* string template,
// not the real generator: the authoritative Qiskit/QASM output for a saved
// circuit comes from the backend (backend/codegen.py) once custom operations
// are resolved (lib/customGateResolve.ts). Kept intentionally simple and
// readable, matching the style of the existing V1 codegen templater.
import {
  definitionNumClbits,
  definitionNumQubits,
  isMatrixDefinition,
  parseCustomGateRef,
  type ComplexPair,
  type CustomDefinition,
  type DecompositionStep,
} from "./customGates";
import { canonicalOperationOrder } from "./circuitOrdering";

function formatComplex(pair: ComplexPair): string {
  const [re, im] = pair;
  const reText = Number.isInteger(re) ? re.toString() : re.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  const imText = Number.isInteger(Math.abs(im)) ? Math.abs(im).toString() : Math.abs(im).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return `${reText}${im < 0 ? "-" : "+"}${imText}j`;
}

function matrixPreview(matrix: ComplexPair[][], label: string): string {
  const rows = matrix.map((row) => `    [${row.map(formatComplex).join(", ")}],`).join("\n");
  return [
    "from qiskit.circuit.library import UnitaryGate",
    "import numpy as np",
    "",
    "matrix = np.array([",
    rows,
    "])",
    `gate = UnitaryGate(matrix, label=${JSON.stringify(label)})`,
    "# qc.append(gate, [<qubits in this definition's own order>])",
  ].join("\n");
}

function pyFunctionName(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[a-z]/.test(slug) ? slug : `gate_${slug || "definition"}`;
}

function stepArg(value: number | `param:${string}`): string {
  if (typeof value === "number") return Number.isInteger(value) ? value.toString() : value.toFixed(4);
  return value.slice(6);
}

function stepLine(step: DecompositionStep, library: ReadonlyMap<string, CustomDefinition>): string {
  const [q0, q1] = step.qubits;
  const nestedId = parseCustomGateRef(step.gate);
  if (nestedId !== null) {
    const nested = library.get(nestedId);
    return `    # ${nested ? nested.name : "custom gate"} (custom:${nestedId}) on qubit(s) ${step.qubits.join(", ")} — expands recursively at simulate/export time`;
  }
  switch (step.gate) {
    case "x": case "y": case "z": case "h": case "s": case "t":
      return `    qc.${step.gate}(${q0})`;
    case "rx": case "ry": case "rz": {
      const theta = step.params.theta !== undefined ? stepArg(step.params.theta) : "0";
      return `    qc.${step.gate}(${theta}, ${q0})`;
    }
    case "cx": case "cz": case "swap":
      return `    qc.${step.gate}(${q0}, ${q1})`;
    case "measure":
      return `    qc.measure(${q0}, ${step.clbits[0] ?? 0})`;
    case "barrier":
      return `    qc.barrier(${step.qubits.join(", ")})`;
    default:
      return `    # unrecognized step gate "${step.gate}"`;
  }
}

function decompositionPreview(definition: Extract<CustomDefinition, { kind: "decomposition" | "composite" }>, library: ReadonlyMap<string, CustomDefinition>): string {
  const fnName = pyFunctionName(definition.name);
  const params = definition.kind === "decomposition"
    ? definition.parameters.map((p) => `${p.name}=${Number.isInteger(p.default) ? p.default : p.default.toFixed(4)}`).join(", ")
    : "";
  const steps = canonicalOperationOrder(definition.steps)
    .map((step) => stepLine(step, library))
    .join("\n");
  return [
    "from qiskit import QuantumCircuit",
    "",
    `def ${fnName}(${params}):`,
    `    qc = QuantumCircuit(${definitionNumQubits(definition)}, ${definitionNumClbits(definition)}, name=${JSON.stringify(definition.label)})`,
    steps || "    pass",
    "    return qc.to_gate(label=" + JSON.stringify(definition.label) + ")",
    "",
    `# qc.append(${fnName}(), [<qubits>]${definitionNumClbits(definition) > 0 ? ", [<clbits>]" : ""})`,
  ].join("\n");
}

/** Read-only preview text — never executed, only ever displayed. */
export function previewQiskitCode(definition: CustomDefinition, library: ReadonlyMap<string, CustomDefinition> = new Map()): string {
  if (isMatrixDefinition(definition)) return matrixPreview(definition.matrix, definition.label);
  return decompositionPreview(definition, library);
}
