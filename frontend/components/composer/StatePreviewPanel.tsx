"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/primitives";
import { computeStatePreview, MAX_PREVIEW_QUBITS } from "@/lib/statevector";
import type { CircuitData } from "@/lib/types";

const RAD_TO_DEG = 180 / Math.PI;
const SHOWN_STATES = 6;

/** Small X–Z plane projection of the 1-qubit Bloch vector (no dependency). */
function BlochProjection({ x, y, z }: { x: number; y: number; z: number }) {
  const cx = 44;
  const cy = 44;
  const r = 36;
  const tipX = cx + x * r;
  const tipY = cy - z * r;
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 88 88" className="h-20 w-20 shrink-0" role="img" aria-label={`Bloch vector projection: x ${x.toFixed(2)}, y ${y.toFixed(2)}, z ${z.toFixed(2)}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2a3c4e" strokeWidth="1" />
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="#1b2937" strokeWidth="1" />
        <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="#1b2937" strokeWidth="1" />
        <text x={cx} y={cy - r + 9} textAnchor="middle" fill="#6f8092" fontSize="7" fontFamily="monospace">|0⟩</text>
        <text x={cx} y={cy + r - 3} textAnchor="middle" fill="#6f8092" fontSize="7" fontFamily="monospace">|1⟩</text>
        <line x1={cx} y1={cy} x2={tipX} y2={tipY} stroke="#22d3ee" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx={tipX} cy={tipY} r="2.6" fill="#22d3ee" />
      </svg>
      <dl className="space-y-0.5 font-mono text-[11px] text-lab-muted">
        <div className="flex gap-2"><dt className="w-7 text-lab-faint">⟨X⟩</dt><dd className="tabular-nums text-lab-text">{x.toFixed(3)}</dd></div>
        <div className="flex gap-2"><dt className="w-7 text-lab-faint">⟨Y⟩</dt><dd className="tabular-nums text-lab-text">{y.toFixed(3)}</dd></div>
        <div className="flex gap-2"><dt className="w-7 text-lab-faint">⟨Z⟩</dt><dd className="tabular-nums text-lab-text">{z.toFixed(3)}</dd></div>
      </dl>
    </div>
  );
}

export function StatePreviewPanel({ circuit }: { circuit: CircuitData }) {
  const preview = useMemo(() => computeStatePreview(circuit), [circuit]);

  return (
    <section className="mt-5 border-t border-lab-border pt-4" aria-labelledby="state-preview-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="state-preview-heading" className="instrument-label">Live state preview</h2>
        <Badge tone={preview ? "cyan" : "neutral"}>{preview ? "ideal · local" : `> ${MAX_PREVIEW_QUBITS} qubits`}</Badge>
      </div>

      {!preview ? (
        <p className="mt-2 rounded-md border border-dashed border-lab-border px-3 py-2 text-[11px] leading-4 text-lab-faint">
          The in-browser preview computes 2ⁿ amplitudes and stops above {MAX_PREVIEW_QUBITS} qubits — the same exponential wall that
          limits every exact simulator. Use Simulator Lab for engine-routed analysis.
        </p>
      ) : (
        <>
          {preview.bloch && (
            <div className="mt-3 rounded-lg border border-lab-border bg-lab-raised/40 p-3">
              <p className="instrument-label mb-2">Bloch vector · X–Z projection</p>
              <BlochProjection x={preview.bloch.x} y={preview.bloch.y} z={preview.bloch.z} />
            </div>
          )}

          <ol className="mt-3 space-y-1.5" aria-label="Basis-state probabilities">
            {[...preview.entries]
              .sort((left, right) => right.probability - left.probability)
              .slice(0, SHOWN_STATES)
              .filter((entry) => entry.probability > 1e-9)
              .map((entry) => (
                <li key={entry.basis} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                  <span className="font-mono text-[11px] text-lab-muted">|{entry.basis}⟩</span>
                  <span className="relative h-2.5 overflow-hidden rounded-sm bg-lab-raised" role="meter" aria-label={`State ${entry.basis}: ${(entry.probability * 100).toFixed(1)} percent`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(entry.probability * 100)}>
                    <span className="absolute inset-y-0 left-0 rounded-sm bg-accent-cyan/80" style={{ width: `${entry.probability * 100}%` }} />
                  </span>
                  <span className="whitespace-nowrap text-right font-mono text-[10px] tabular-nums text-lab-faint">
                    {(entry.probability * 100).toFixed(1)}% <span className="text-lab-faint/70">∠{(entry.phase * RAD_TO_DEG).toFixed(0)}°</span>
                  </span>
                </li>
              ))}
          </ol>

          <p className="mt-2 text-[10px] leading-4 text-lab-faint">
            Ideal pre-measurement state, computed locally as you edit.
            {preview.ignoredMeasurements > 0 && ` ${preview.ignoredMeasurements} measurement op${preview.ignoredMeasurements === 1 ? "" : "s"} ignored here — run the circuit for sampled counts.`}
            {" "}Phase ∠ is relative to the |{"0".repeat(preview.numQubits)}⟩ amplitude convention.
          </p>
        </>
      )}
    </section>
  );
}
