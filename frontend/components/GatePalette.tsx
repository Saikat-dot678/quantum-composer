import type { GateName } from "@/lib/types";
const groups: { label: string; gates: { id: GateName; label: string }[] }[] = [
  { label: "Single qubit", gates: ["x", "y", "z", "h", "s", "t"].map((id) => ({ id: id as GateName, label: id.toUpperCase() })) },
  { label: "Rotations", gates: ["rx", "ry", "rz"].map((id) => ({ id: id as GateName, label: `${id.toUpperCase()}(θ)` })) },
  { label: "Multi-qubit", gates: [{ id: "cx", label: "CX" }, { id: "cz", label: "CZ" }, { id: "swap", label: "SWAP" }] },
  { label: "Circuit", gates: [{ id: "measure", label: "Measure" }, { id: "barrier", label: "Barrier" }] },
];
interface Props { selected: GateName; theta: number; onSelect: (gate: GateName) => void; onThetaChange: (theta: number) => void }
export function GatePalette({ selected, theta, onSelect, onThetaChange }: Props) {
  return <section><div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Gate library</h2><span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700">click to place</span></div><div className="space-y-4">{groups.map((group) => <div key={group.label}><p className="mb-2 text-[11px] font-medium text-slate-400">{group.label}</p><div className="grid grid-cols-3 gap-2">{group.gates.map((gate) => <button key={gate.id} type="button" onClick={() => onSelect(gate.id)} className={`min-h-10 rounded-lg border px-2 text-xs font-semibold transition ${selected === gate.id ? "border-violet-500 bg-violet-600 text-white shadow-md shadow-violet-200" : "border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50"}`} aria-pressed={selected === gate.id}>{gate.label}</button>)}</div></div>)}</div><label className="mt-4 block rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">Rotation θ · radians<input type="number" step="0.1" value={theta} onChange={(event) => onThetaChange(Number(event.target.value))} className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-slate-800 outline-none focus:border-violet-400" /></label></section>;
}
