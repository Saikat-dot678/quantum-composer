"use client";

// The hero visual for the Simulator Lab: quantum simulation's central fact —
// exact classical methods cost exponentially more per qubit — plotted
// directly instead of stated in a badge. Statevector (16 x 2^n bytes) and
// density matrix (16 x 4^n bytes) are exact formulas, so the marker at the
// circuit's actual qubit count is authoritative on those two curves. The
// stabilizer and MPS curves depend on gate structure and bond dimension, not
// qubit count alone, so they are drawn lighter and labeled "illustrative" —
// the analyzer's own per-circuit byte estimate (shown as text, not read off
// the chart) remains the authoritative number for this specific circuit.
import { useId, useMemo, useState } from "react";
import { LIMITS } from "@/lib/constants";
import { formatInteger } from "@/lib/formatting";

const Q_MAX = 32;
const LOG2_MAX = 60; // 1 EiB ceiling; curves are clipped/faded above this.
const UNIT_STEPS: Array<{ log2: number; label: string }> = [
  { log2: 0, label: "1 B" },
  { log2: 10, label: "1 KiB" },
  { log2: 20, label: "1 MiB" },
  { log2: 30, label: "1 GiB" },
  { log2: 40, label: "1 TiB" },
  { log2: 50, label: "1 PiB" },
  { log2: 60, label: "1 EiB" },
];

const W = 720;
const H = 210;
const MARGIN = { left: 46, right: 16, top: 14, bottom: 24 };
const PLOT_W = W - MARGIN.left - MARGIN.right;
const PLOT_H = H - MARGIN.top - MARGIN.bottom;

const xAt = (n: number) => MARGIN.left + (Math.min(n, Q_MAX) / Q_MAX) * PLOT_W;
const yAt = (log2Bytes: number) => MARGIN.top + PLOT_H - (Math.min(Math.max(log2Bytes, 0), LOG2_MAX) / LOG2_MAX) * PLOT_H;

function pathFor(fn: (n: number) => number, from: number, to: number, step = 0.5): string {
  const points: string[] = [];
  for (let n = from; n <= to; n += step) points.push(`${xAt(n).toFixed(1)},${yAt(fn(n)).toFixed(1)}`);
  return `M${points.join(" L")}`;
}

/** Closed polygon between two curves over [from, to]: lower curve forward, upper curve back. */
function bandPath(lowerFn: (n: number) => number, upperFn: (n: number) => number, from: number, to: number, step = 0.5): string {
  const forward: string[] = [];
  for (let n = from; n <= to; n += step) forward.push(`${xAt(n).toFixed(1)},${yAt(lowerFn(n)).toFixed(1)}`);
  const backward: string[] = [];
  for (let n = to; n >= from; n -= step) backward.push(`${xAt(n).toFixed(1)},${yAt(upperFn(n)).toFixed(1)}`);
  return `M${forward.join(" L")} L${backward.join(" L")} Z`;
}

const statevectorLog2 = (n: number) => 4 + n;
const densityLog2 = (n: number) => 4 + 2 * n;
/** Illustrative only: a (2n+1) x 2n-bit tableau, not a measured allocation. */
const stabilizerLog2 = (n: number) => Math.log2(Math.max(1, (2 * n * (2 * n + 1)) / 8) + 16);
/** Illustrative only: representative bond dimension chi=16, not a measured allocation. */
const mpsTypicalLog2 = (n: number) => Math.log2(Math.max(1, 16 * Math.max(n - 1, 0) * 16 * 16 * 2) + 16);

interface CurveDef {
  id: string;
  label: string;
  fn: (n: number) => number;
  hardCap?: number;
  color: string;
  illustrative?: boolean;
}

const CURVES: CurveDef[] = [
  { id: "statevector", label: "Statevector", fn: statevectorLog2, hardCap: LIMITS.simulation.statevectorHardCapQubits, color: "#4f46e5" },
  { id: "density", label: "Density matrix", fn: densityLog2, hardCap: LIMITS.simulation.densityMatrixHardCapQubits, color: "#dc2626" },
  { id: "stabilizer", label: "Stabilizer (Clifford)", fn: stabilizerLog2, color: "#059669", illustrative: true },
  { id: "mps", label: "MPS, typical χ=16", fn: mpsTypicalLog2, color: "#d97706", illustrative: true },
];

export function EngineScalingChart({
  numQubits,
  maxMemoryMb,
  isClifford,
  highlightLaneId,
}: {
  numQubits: number;
  maxMemoryMb: number;
  isClifford: boolean | null;
  highlightLaneId: string | null;
}) {
  const gridId = useId();
  const [hoverN, setHoverN] = useState<number | null>(null);
  const budgetLog2 = useMemo(() => Math.log2(Math.max(1, maxMemoryMb)) + 20, [maxMemoryMb]);
  const budgetY = yAt(budgetLog2);
  const markerX = xAt(numQubits);

  return (
    <div className="rounded-xl2 border border-line bg-surface p-3 shadow-floating sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="eyebrow">Memory scaling, exact vs. structured methods</p>
          <p className="mt-0.5 text-[11px] leading-4 text-ink-500">Bytes needed to represent the full quantum state, by qubit count. Log scale — every gridline is 1024x the one below it.</p>
        </div>
        <p className="font-mono text-[10px] text-ink-400">illustrative curves · your circuit&rsquo;s exact figure is quoted below</p>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Memory scaling chart. Your circuit has ${numQubits} qubits. Statevector needs 2 to the power ${numQubits} amplitudes; density matrix needs 4 to the power ${numQubits}.`}
        className="mt-2 h-auto w-full touch-none"
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const localX = ((event.clientX - rect.left) / rect.width) * W;
          const n = Math.round(((localX - MARGIN.left) / PLOT_W) * Q_MAX);
          setHoverN(n >= 0 && n <= Q_MAX ? n : null);
        }}
        onPointerLeave={() => setHoverN(null)}
      >
        <defs>
          <pattern id={gridId} width={PLOT_W / (Q_MAX / 4)} height={PLOT_H / (LOG2_MAX / 10)} patternUnits="userSpaceOnUse">
            <path d={`M ${PLOT_W / (Q_MAX / 4)} 0 L 0 0 0 ${PLOT_H / (LOG2_MAX / 10)}`} fill="none" stroke="#ececef" strokeWidth={1} />
          </pattern>
        </defs>

        <rect x={MARGIN.left} y={MARGIN.top} width={PLOT_W} height={PLOT_H} fill={`url(#${gridId})`} />

        {UNIT_STEPS.map(({ log2, label }) => (
          <g key={log2}>
            <line x1={MARGIN.left} y1={yAt(log2)} x2={W - MARGIN.right} y2={yAt(log2)} stroke="#e4e4e7" strokeWidth={1} />
            <text x={MARGIN.left - 6} y={yAt(log2)} textAnchor="end" dominantBaseline="middle" fontFamily="var(--font-mono)" fontSize={9} fill="#8b8b93">{label}</text>
          </g>
        ))}
        {[0, 8, 16, 24, 32].map((n) => (
          <text key={n} x={xAt(n)} y={H - MARGIN.bottom + 14} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={9} fill="#8b8b93">{n}q</text>
        ))}
        <text x={W - MARGIN.right} y={H - 4} textAnchor="end" fontFamily="var(--font-mono)" fontSize={9} fill="#c2c2c9">qubits →</text>

        {/* MPS band: shaded region between the typical-χ estimate and the statevector worst case. */}
        <path d={bandPath(mpsTypicalLog2, statevectorLog2, 1, Q_MAX)} fill="#d97706" opacity={0.06} />

        {/* Run budget line. */}
        {budgetLog2 <= LOG2_MAX && (
          <g>
            <line x1={MARGIN.left} y1={budgetY} x2={W - MARGIN.right} y2={budgetY} stroke="#3f3f46" strokeWidth={1} strokeDasharray="5 3" opacity={0.55} />
            <text x={W - MARGIN.right} y={budgetY - 4} textAnchor="end" fontFamily="var(--font-mono)" fontSize={9} fontWeight={700} fill="#3f3f46">{formatInteger(maxMemoryMb)} MiB budget</text>
          </g>
        )}

        {CURVES.map((curve) => {
          const cap = curve.hardCap ?? Q_MAX;
          const dimmed = highlightLaneId != null && highlightLaneId !== curve.id;
          const relevant = curve.id === "stabilizer" ? isClifford === true : curve.id !== "stabilizer";
          return (
            <g key={curve.id} opacity={dimmed ? 0.25 : relevant ? 1 : 0.55}>
              <path d={pathFor(curve.fn, 0, cap)} fill="none" stroke={curve.color} strokeWidth={curve.illustrative ? 1.5 : 2} strokeDasharray={curve.illustrative ? "1 3" : undefined} strokeLinecap="round" />
              {cap < Q_MAX && (
                <path d={pathFor(curve.fn, cap, Q_MAX)} fill="none" stroke={curve.color} strokeWidth={1.5} strokeDasharray="2 3" opacity={0.5} />
              )}
            </g>
          );
        })}

        {/* Current circuit marker: exact on the two closed-form curves. */}
        <line x1={markerX} y1={MARGIN.top} x2={markerX} y2={H - MARGIN.bottom} stroke="#18181b" strokeWidth={1.25} strokeDasharray="3 2" opacity={0.5} />
        {[statevectorLog2, densityLog2].map((fn, index) => (
          <circle key={index} cx={markerX} cy={yAt(fn(numQubits))} r={3.5} fill="#ffffff" stroke={index === 0 ? "#4f46e5" : "#dc2626"} strokeWidth={2} />
        ))}
        <text x={markerX} y={MARGIN.top - 3} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={9} fontWeight={700} fill="#18181b">{numQubits}q</text>

        {hoverN != null && (
          <g pointerEvents="none">
            <line x1={xAt(hoverN)} y1={MARGIN.top} x2={xAt(hoverN)} y2={H - MARGIN.bottom} stroke="#a5a6f6" strokeWidth={1} />
            <text x={xAt(hoverN)} y={MARGIN.top + 10} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={9} fill="#4338ca">
              {hoverN}q · SV {(statevectorLog2(hoverN)).toFixed(0)} bits
            </text>
          </g>
        )}
      </svg>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line-hairline pt-2">
        {CURVES.map((curve) => (
          <span key={curve.id} className="flex items-center gap-1.5 text-[10px] text-ink-500">
            <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: curve.color, opacity: curve.illustrative ? 0.55 : 1 }} />
            {curve.label}{curve.illustrative && <span className="text-ink-400"> (illustrative)</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
