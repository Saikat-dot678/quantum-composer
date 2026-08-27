import type { ComplexPair } from "./customGates";

/** Canonical built-ins that may be placed, persisted, shared, and sent to the backend. */
export const BUILTIN_GATE_NAMES = [
  "id", "x", "y", "z", "h", "sx", "sxdg",
  "s", "sdg", "t", "tdg", "p",
  "rx", "ry", "rz", "u",
  "cx", "cy", "cz", "ch", "cp", "crx", "cry", "crz",
  "swap", "iswap", "dcx", "ecr", "ccx", "cswap", "mcx", "mcp",
  "rxx", "ryy", "rzz", "rzx",
  "measure", "reset", "barrier",
] as const;

export type BuiltinGateName = (typeof BUILTIN_GATE_NAMES)[number];
export type GateCategory = "Basic" | "Phase" | "Rotation" | "Universal" | "Controlled" | "Multi-qubit" | "Interaction" | "Circuit operations";
export type OperationKind = "unitary" | "measurement" | "reset" | "barrier";
export type GateVisual = "box" | "controlled" | "swap" | "interaction" | "measurement" | "reset" | "barrier";

export interface GateParameterSpec {
  name: "theta" | "phi" | "lam";
  label: string;
  default: number;
  description: string;
}

export interface GateDefinition {
  id: BuiltinGateName;
  label: string;
  name: string;
  description: string;
  category: GateCategory;
  aliases: readonly string[];
  operationKind: OperationKind;
  minQubits: number;
  maxQubits: number | null;
  defaultQubits: number;
  clbits: number;
  parameters: readonly GateParameterSpec[];
  controlCount: number | "all-but-last";
  targetCount: number | "remaining";
  reversible: boolean;
  inverse: BuiltinGateName | null;
  visual: GateVisual;
  matrix?: (params: Readonly<Record<string, number>>, qubitCount: number) => ComplexPair[][];
}

const ZERO: ComplexPair = [0, 0];
const ONE: ComplexPair = [1, 0];
const I: ComplexPair = [0, 1];
const INV_SQRT2 = Math.SQRT1_2;

function complex(re: number, im = 0): ComplexPair { return [re, im]; }
function scale([re, im]: ComplexPair, value: number): ComplexPair { return [re * value, im * value]; }
function multiply([ar, ai]: ComplexPair, [br, bi]: ComplexPair): ComplexPair { return [ar * br - ai * bi, ar * bi + ai * br]; }
function expi(theta: number): ComplexPair { return [Math.cos(theta), Math.sin(theta)]; }
function matrix(rows: ComplexPair[][]): ComplexPair[][] { return rows; }

function identityMatrix(size: number): ComplexPair[][] {
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => (row === col ? ONE : ZERO)));
}

function permutationMatrix(qubitCount: number, outputForInput: (input: number) => number): ComplexPair[][] {
  const size = 1 << qubitCount;
  const result = Array.from({ length: size }, () => Array.from({ length: size }, () => complex(0)));
  for (let input = 0; input < size; input += 1) result[outputForInput(input)][input] = complex(1);
  return result;
}

/** Controls occupy local bits 0..controlCount-1; the target is the final local bit. */
function controlled(base: ComplexPair[][], controlCount = 1): ComplexPair[][] {
  const qubitCount = controlCount + 1;
  const size = 1 << qubitCount;
  const targetBit = 1 << controlCount;
  const controlsMask = targetBit - 1;
  const result = Array.from({ length: size }, () => Array.from({ length: size }, () => complex(0)));
  for (let input = 0; input < size; input += 1) {
    if ((input & controlsMask) !== controlsMask) {
      result[input][input] = complex(1);
      continue;
    }
    const inputTarget = (input & targetBit) === 0 ? 0 : 1;
    for (let outputTarget = 0; outputTarget < 2; outputTarget += 1) {
      const output = outputTarget === 0 ? input & ~targetBit : input | targetBit;
      result[output][input] = [...base[outputTarget][inputTarget]] as ComplexPair;
    }
  }
  return result;
}

type Pauli = "x" | "y" | "z";

/** `paulis[bit]` acts on that local (little-endian) qubit bit. */
function pauliProduct(paulis: readonly Pauli[]): ComplexPair[][] {
  const size = 1 << paulis.length;
  const result = Array.from({ length: size }, () => Array.from({ length: size }, () => complex(0)));
  for (let input = 0; input < size; input += 1) {
    let output = input;
    let amplitude: ComplexPair = complex(1);
    for (let bit = 0; bit < paulis.length; bit += 1) {
      const set = (input & (1 << bit)) !== 0;
      if (paulis[bit] === "x") output ^= 1 << bit;
      if (paulis[bit] === "y") {
        output ^= 1 << bit;
        amplitude = multiply(amplitude, set ? complex(0, -1) : complex(0, 1));
      }
      if (paulis[bit] === "z" && set) amplitude = scale(amplitude, -1);
    }
    result[output][input] = amplitude;
  }
  return result;
}

function pauliRotation(paulis: readonly Pauli[], theta: number): ComplexPair[][] {
  const size = 1 << paulis.length;
  const identity = identityMatrix(size);
  const product = pauliProduct(paulis);
  const c = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  return identity.map((row, r) => row.map((entry, col) => {
    const p = product[r][col];
    // cI - i sP
    return complex(c * entry[0] + s * p[1], c * entry[1] - s * p[0]);
  }));
}

const X = matrix([[ZERO, ONE], [ONE, ZERO]]);
const Y = matrix([[ZERO, complex(0, -1)], [complex(0, 1), ZERO]]);
const Z = matrix([[ONE, ZERO], [ZERO, complex(-1)]]);
const H = matrix([[complex(INV_SQRT2), complex(INV_SQRT2)], [complex(INV_SQRT2), complex(-INV_SQRT2)]]);

function phase(theta: number): ComplexPair[][] { return matrix([[ONE, ZERO], [ZERO, expi(theta)]]); }
function rx(theta: number): ComplexPair[][] { const c = Math.cos(theta / 2), s = Math.sin(theta / 2); return matrix([[complex(c), complex(0, -s)], [complex(0, -s), complex(c)]]); }
function ry(theta: number): ComplexPair[][] { const c = Math.cos(theta / 2), s = Math.sin(theta / 2); return matrix([[complex(c), complex(-s)], [complex(s), complex(c)]]); }
function rz(theta: number): ComplexPair[][] { return matrix([[expi(-theta / 2), ZERO], [ZERO, expi(theta / 2)]]); }
function u(params: Readonly<Record<string, number>>): ComplexPair[][] {
  const theta = params.theta ?? 0;
  const phi = params.phi ?? 0;
  const lam = params.lam ?? 0;
  const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
  return matrix([
    [complex(c), scale(expi(lam), -s)],
    [scale(expi(phi), s), scale(expi(phi + lam), c)],
  ]);
}

const THETA: readonly GateParameterSpec[] = [{ name: "theta", label: "θ", default: Math.PI / 2, description: "Angle in radians" }];
const U_PARAMETERS: readonly GateParameterSpec[] = [
  ...THETA,
  { name: "phi", label: "φ", default: 0, description: "Azimuthal phase in radians" },
  { name: "lam", label: "λ", default: Math.PI, description: "Final phase in radians" },
];

interface DefinitionInput extends Omit<GateDefinition, "aliases" | "operationKind" | "minQubits" | "maxQubits" | "defaultQubits" | "clbits" | "parameters" | "controlCount" | "targetCount" | "reversible" | "inverse" | "visual"> {
  aliases?: readonly string[];
  operationKind?: OperationKind;
  qubits?: number | { min: number; max: number | null; default: number };
  clbits?: number;
  parameters?: readonly GateParameterSpec[];
  controls?: number | "all-but-last";
  targets?: number | "remaining";
  reversible?: boolean;
  inverse?: BuiltinGateName | null;
  visual?: GateVisual;
}

function define(input: DefinitionInput): GateDefinition {
  const arity = typeof input.qubits === "object" ? input.qubits : { min: input.qubits ?? 1, max: input.qubits ?? 1, default: input.qubits ?? 1 };
  const { qubits: _qubits, ...rest } = input;
  void _qubits;
  return {
    aliases: [], operationKind: "unitary", clbits: 0, parameters: [], controlCount: 0,
    targetCount: 1, reversible: true, inverse: input.id, visual: "box",
    ...rest,
    minQubits: arity.min,
    maxQubits: arity.max,
    defaultQubits: arity.default,
  };
}

const specs: GateDefinition[] = [
  define({ id: "id", label: "I", name: "Identity", description: "Leaves the qubit unchanged; useful for explicit timing and teaching.", category: "Basic", aliases: ["identity"], inverse: "id", matrix: () => identityMatrix(2) }),
  define({ id: "x", label: "X", name: "Pauli X", description: "Swaps |0⟩ and |1⟩ (a quantum NOT in the computational basis).", category: "Basic", inverse: "x", matrix: () => X }),
  define({ id: "y", label: "Y", name: "Pauli Y", description: "Applies a bit flip with a relative complex phase.", category: "Basic", inverse: "y", matrix: () => Y }),
  define({ id: "z", label: "Z", name: "Pauli Z", description: "Flips the phase of the |1⟩ amplitude without changing basis probabilities.", category: "Basic", inverse: "z", matrix: () => Z }),
  define({ id: "h", label: "H", name: "Hadamard", description: "Changes between computational and X bases, enabling superposition and interference.", category: "Basic", inverse: "h", matrix: () => H }),
  define({ id: "sx", label: "√X", name: "Square-root X", description: "A half X rotation; applying it twice gives X up to numerical tolerance.", category: "Basic", inverse: "sxdg", matrix: () => matrix([[complex(.5, .5), complex(.5, -.5)], [complex(.5, -.5), complex(.5, .5)]]) }),
  define({ id: "sxdg", label: "√X†", name: "Inverse square-root X", description: "The inverse of √X.", category: "Basic", inverse: "sx", matrix: () => matrix([[complex(.5, -.5), complex(.5, .5)], [complex(.5, .5), complex(.5, -.5)]]) }),
  define({ id: "s", label: "S", name: "S phase", description: "Adds π/2 phase to |1⟩; a Clifford phase gate.", category: "Phase", inverse: "sdg", matrix: () => phase(Math.PI / 2) }),
  define({ id: "sdg", label: "S†", name: "S dagger", description: "Inverse S phase (−π/2 on |1⟩).", category: "Phase", aliases: ["sdag"], inverse: "s", matrix: () => phase(-Math.PI / 2) }),
  define({ id: "t", label: "T", name: "T phase", description: "Adds π/4 phase to |1⟩; a standard non-Clifford resource.", category: "Phase", inverse: "tdg", matrix: () => phase(Math.PI / 4) }),
  define({ id: "tdg", label: "T†", name: "T dagger", description: "Inverse T phase (−π/4 on |1⟩).", category: "Phase", aliases: ["tdag"], inverse: "t", matrix: () => phase(-Math.PI / 4) }),
  define({ id: "p", label: "P", name: "Phase", description: "Applies e^{iθ} to the |1⟩ amplitude.", category: "Phase", aliases: ["phase", "u1"], parameters: THETA, inverse: "p", matrix: (p) => phase(p.theta) }),
  define({ id: "rx", label: "RX", name: "X rotation", description: "Rotates around the Bloch-sphere X axis by θ.", category: "Rotation", parameters: THETA, inverse: "rx", matrix: (p) => rx(p.theta) }),
  define({ id: "ry", label: "RY", name: "Y rotation", description: "Rotates around the Bloch-sphere Y axis by θ.", category: "Rotation", parameters: THETA, inverse: "ry", matrix: (p) => ry(p.theta) }),
  define({ id: "rz", label: "RZ", name: "Z rotation", description: "Rotates phase around the Bloch-sphere Z axis by θ.", category: "Rotation", parameters: THETA, inverse: "rz", matrix: (p) => rz(p.theta) }),
  define({ id: "u", label: "U", name: "Universal U", description: "General single-qubit unitary U(θ, φ, λ); compatible with U3 conventions.", category: "Universal", aliases: ["u3", "u2"], parameters: U_PARAMETERS, inverse: "u", matrix: (p) => u(p) }),
  define({ id: "cx", label: "CX", name: "Controlled X", description: "Applies X to the target when the control is |1⟩.", category: "Controlled", qubits: 2, controls: 1, visual: "controlled", inverse: "cx", aliases: ["cnot"], matrix: () => controlled(X) }),
  define({ id: "cy", label: "CY", name: "Controlled Y", description: "Applies Y to the target when the control is |1⟩.", category: "Controlled", qubits: 2, controls: 1, visual: "controlled", inverse: "cy", matrix: () => controlled(Y) }),
  define({ id: "cz", label: "CZ", name: "Controlled Z", description: "Applies a π phase only to |11⟩.", category: "Controlled", qubits: 2, controls: 1, visual: "controlled", inverse: "cz", matrix: () => controlled(Z) }),
  define({ id: "ch", label: "CH", name: "Controlled H", description: "Applies H to the target when the control is |1⟩.", category: "Controlled", qubits: 2, controls: 1, visual: "controlled", inverse: "ch", matrix: () => controlled(H) }),
  define({ id: "cp", label: "CP", name: "Controlled phase", description: "Applies phase θ to |11⟩.", category: "Controlled", qubits: 2, controls: 1, visual: "controlled", parameters: THETA, inverse: "cp", matrix: (p) => controlled(phase(p.theta)) }),
  define({ id: "crx", label: "CRX", name: "Controlled RX", description: "Conditionally rotates the target around X.", category: "Controlled", qubits: 2, controls: 1, visual: "controlled", parameters: THETA, inverse: "crx", matrix: (p) => controlled(rx(p.theta)) }),
  define({ id: "cry", label: "CRY", name: "Controlled RY", description: "Conditionally rotates the target around Y.", category: "Controlled", qubits: 2, controls: 1, visual: "controlled", parameters: THETA, inverse: "cry", matrix: (p) => controlled(ry(p.theta)) }),
  define({ id: "crz", label: "CRZ", name: "Controlled RZ", description: "Conditionally rotates the target around Z; differs from CP by relative phase.", category: "Controlled", qubits: 2, controls: 1, visual: "controlled", parameters: THETA, inverse: "crz", matrix: (p) => controlled(rz(p.theta)) }),
  define({ id: "swap", label: "SWAP", name: "Swap", description: "Exchanges two qubit states.", category: "Multi-qubit", qubits: 2, targets: 2, visual: "swap", inverse: "swap", matrix: () => permutationMatrix(2, (input) => ((input & 1) << 1) | ((input & 2) >> 1)) }),
  define({ id: "iswap", label: "iSWAP", name: "iSwap", description: "Swaps |01⟩ and |10⟩ while adding phase i.", category: "Multi-qubit", qubits: 2, targets: 2, visual: "interaction", inverse: null, matrix: () => matrix([[ONE, ZERO, ZERO, ZERO], [ZERO, ZERO, I, ZERO], [ZERO, I, ZERO, ZERO], [ZERO, ZERO, ZERO, ONE]]) }),
  define({ id: "dcx", label: "DCX", name: "Double CNOT", description: "Applies CX in one direction followed by CX in the reverse direction.", category: "Multi-qubit", qubits: 2, targets: 2, visual: "interaction", inverse: null, matrix: () => permutationMatrix(2, (input) => { const b0 = input & 1; const b1 = (input >> 1) & 1; return b1 | ((b0 ^ b1) << 1); }) }),
  define({ id: "ecr", label: "ECR", name: "Echoed cross-resonance", description: "IBM-style echoed cross-resonance entangler; a two-qubit Clifford gate.", category: "Multi-qubit", qubits: 2, targets: 2, visual: "interaction", inverse: "ecr", matrix: () => matrix([
    [ZERO, complex(INV_SQRT2), ZERO, complex(0, INV_SQRT2)],
    [complex(INV_SQRT2), ZERO, complex(0, -INV_SQRT2), ZERO],
    [ZERO, complex(0, INV_SQRT2), ZERO, complex(INV_SQRT2)],
    [complex(0, -INV_SQRT2), ZERO, complex(INV_SQRT2), ZERO],
  ]) }),
  define({ id: "ccx", label: "CCX", name: "Toffoli", description: "Flips the target when both controls are |1⟩.", category: "Multi-qubit", qubits: 3, controls: 2, visual: "controlled", inverse: "ccx", aliases: ["toffoli"], matrix: (_p, n) => controlled(X, n - 1) }),
  define({ id: "cswap", label: "CSWAP", name: "Fredkin", description: "Swaps two targets when the control is |1⟩.", category: "Multi-qubit", qubits: 3, controls: 1, targets: 2, visual: "controlled", inverse: "cswap", aliases: ["fredkin"], matrix: () => permutationMatrix(3, (input) => { if ((input & 1) === 0) return input; const b1 = (input >> 1) & 1, b2 = (input >> 2) & 1; return (input & 1) | (b2 << 1) | (b1 << 2); }) }),
  define({ id: "mcx", label: "MCX", name: "Multi-controlled X", description: "Flips the final target when every preceding control is |1⟩.", category: "Multi-qubit", qubits: { min: 2, max: null, default: 3 }, controls: "all-but-last", visual: "controlled", inverse: "mcx", matrix: (_p, n) => controlled(X, n - 1) }),
  define({ id: "mcp", label: "MCP", name: "Multi-controlled phase", description: "Applies phase θ only when all controls and the final target are |1⟩.", category: "Multi-qubit", qubits: { min: 2, max: null, default: 3 }, controls: "all-but-last", visual: "controlled", parameters: THETA, inverse: "mcp", matrix: (p, n) => controlled(phase(p.theta), n - 1) }),
  define({ id: "rxx", label: "RXX", name: "XX interaction", description: "Applies exp(−iθ X⊗X / 2).", category: "Interaction", qubits: 2, targets: 2, visual: "interaction", parameters: THETA, inverse: "rxx", matrix: (p) => pauliRotation(["x", "x"], p.theta) }),
  define({ id: "ryy", label: "RYY", name: "YY interaction", description: "Applies exp(−iθ Y⊗Y / 2).", category: "Interaction", qubits: 2, targets: 2, visual: "interaction", parameters: THETA, inverse: "ryy", matrix: (p) => pauliRotation(["y", "y"], p.theta) }),
  define({ id: "rzz", label: "RZZ", name: "ZZ interaction", description: "Applies exp(−iθ Z⊗Z / 2).", category: "Interaction", qubits: 2, targets: 2, visual: "interaction", parameters: THETA, inverse: "rzz", matrix: (p) => pauliRotation(["z", "z"], p.theta) }),
  define({ id: "rzx", label: "RZX", name: "ZX interaction", description: "Applies exp(−iθ Z(q0)⊗X(q1) / 2) in Qiskit's operand order.", category: "Interaction", qubits: 2, targets: 2, visual: "interaction", parameters: THETA, inverse: "rzx", matrix: (p) => pauliRotation(["z", "x"], p.theta) }),
  define({ id: "measure", label: "M", name: "Measurement", description: "Projectively measures one qubit in the Z basis and writes the outcome to a classical bit.", category: "Circuit operations", operationKind: "measurement", clbits: 1, reversible: false, inverse: null, visual: "measurement" }),
  define({ id: "reset", label: "|0⟩", name: "Reset", description: "Discards the qubit state and prepares |0⟩; this is a non-unitary channel.", category: "Circuit operations", operationKind: "reset", reversible: false, inverse: null, visual: "reset" }),
  define({ id: "barrier", label: "‖", name: "Barrier", description: "A compiler ordering boundary over selected qubits; it is not an identity gate.", category: "Circuit operations", operationKind: "barrier", qubits: { min: 1, max: null, default: 1 }, targets: "remaining", reversible: false, inverse: null, visual: "barrier" }),
];

export const GATE_DEFINITIONS: Readonly<Record<BuiltinGateName, GateDefinition>> = Object.freeze(
  Object.fromEntries(specs.map((spec) => [spec.id, Object.freeze(spec)])) as Record<BuiltinGateName, GateDefinition>,
);

export const GATE_CATEGORIES: readonly GateCategory[] = ["Basic", "Phase", "Rotation", "Universal", "Controlled", "Multi-qubit", "Interaction", "Circuit operations"];
export const BUILTIN_GATE_SET: ReadonlySet<string> = new Set(BUILTIN_GATE_NAMES);

export function getGateDefinition(gate: BuiltinGateName): GateDefinition { return GATE_DEFINITIONS[gate]; }
export function gateControlCount(gate: BuiltinGateName, qubitCount: number): number {
  const count = GATE_DEFINITIONS[gate].controlCount;
  return count === "all-but-last" ? Math.max(0, qubitCount - 1) : count;
}
export function defaultGateParams(gate: BuiltinGateName): Record<string, number> {
  return Object.fromEntries(GATE_DEFINITIONS[gate].parameters.map((parameter) => [parameter.name, parameter.default]));
}
export function gateMatrix(gate: BuiltinGateName, params: Readonly<Record<string, number>>, qubitCount: number): ComplexPair[][] | null {
  return GATE_DEFINITIONS[gate].matrix?.(params, qubitCount) ?? null;
}

const ALWAYS_CLIFFORD = new Set<BuiltinGateName>(["id", "x", "y", "z", "h", "sx", "sxdg", "s", "sdg", "cx", "cy", "cz", "swap", "iswap", "dcx", "ecr", "measure", "reset", "barrier"]);
const HALF_PI_CLIFFORD = new Set<BuiltinGateName>(["p", "rx", "ry", "rz", "rxx", "ryy", "rzz", "rzx"]);
const PI_CLIFFORD = new Set<BuiltinGateName>(["cp", "crx", "cry", "crz"]);
const angleMultiple = (theta: number, unit: number) => Number.isFinite(theta) && Math.abs(theta / unit - Math.round(theta / unit)) < 1e-9;

/** Exact Clifford classification mirrored by backend/gate_registry.py. */
export function gateIsClifford(gate: BuiltinGateName, params: Readonly<Record<string, number>>): boolean {
  if (ALWAYS_CLIFFORD.has(gate)) return true;
  if (HALF_PI_CLIFFORD.has(gate)) return angleMultiple(params.theta, Math.PI / 2);
  if (PI_CLIFFORD.has(gate)) return angleMultiple(params.theta, Math.PI);
  return false;
}

export function validateBuiltinOperation(
  gate: BuiltinGateName,
  qubits: readonly number[],
  clbits: readonly number[],
  params: Readonly<Record<string, unknown>>,
): string | null {
  const spec = GATE_DEFINITIONS[gate];
  if (qubits.length < spec.minQubits || (spec.maxQubits !== null && qubits.length > spec.maxQubits)) {
    return `${gate} has an invalid qubit count.`;
  }
  if (clbits.length !== spec.clbits) return `${gate} requires ${spec.clbits} classical bit(s).`;
  if (new Set(qubits).size !== qubits.length || new Set(clbits).size !== clbits.length) return `${gate} cannot reuse an operand.`;
  const expected = spec.parameters.map((parameter) => parameter.name);
  if (Object.keys(params).length !== expected.length || expected.some((name) => typeof params[name] !== "number" || !Number.isFinite(params[name]))) {
    return expected.length ? `${gate} requires finite ${expected.join(", ")} parameter(s).` : `${gate} does not accept parameters.`;
  }
  if (Object.keys(params).some((name) => !expected.includes(name as GateParameterSpec["name"]))) return `${gate} has an unsupported parameter.`;
  return null;
}

/** Operand role used by the Inspector and accessible canvas descriptions. */
export function operandRole(gate: BuiltinGateName, index: number, qubitCount: number): string {
  const spec = GATE_DEFINITIONS[gate];
  const controls = gateControlCount(gate, qubitCount);
  if (index < controls) return controls === 1 ? "control" : `control ${index + 1}`;
  if (spec.targetCount === 1) return "target";
  return `target ${index - controls + 1}`;
}
