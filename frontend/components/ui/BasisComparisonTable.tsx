import type { ReactNode } from "react";

// Visualizes BB84 basis reconciliation: for each transmission, Alice's basis over
// Bob's basis, highlighting where they matched (kept for the sifted key) vs
// differed (discarded). Optionally overlays Alice's bit and Bob's measurement.
export function BasisComparisonTable({
  aliceBases,
  bobBases,
  aliceBits,
  bobMeasurements,
  limit = 40,
}: {
  aliceBases: string[];
  bobBases: string[];
  aliceBits?: number[];
  bobMeasurements?: number[];
  limit?: number;
}) {
  const n = Math.min(limit, aliceBases.length, bobBases.length);
  const cols = Array.from({ length: n }, (_, i) => i);
  const matched = cols.filter((i) => aliceBases[i] === bobBases[i]).length;

  const Row = ({ label, render }: { label: string; render: (i: number) => ReactNode }) => (
    <div className="flex items-center gap-0.5">
      <span className="w-16 shrink-0 text-right text-[10px] uppercase tracking-wide text-lab-faint">{label}</span>
      {cols.map((i) => (
        <span key={i} className="w-5 text-center font-mono text-[11px] text-lab-muted">
          {render(i)}
        </span>
      ))}
    </div>
  );

  return (
    <div className="overflow-x-auto">
      <div className="min-w-max space-y-0.5">
        {aliceBits && <Row label="A bit" render={(i) => aliceBits[i]} />}
        <Row label="A basis" render={(i) => aliceBases[i]} />
        <Row label="B basis" render={(i) => bobBases[i]} />
        {bobMeasurements && <Row label="B meas" render={(i) => bobMeasurements[i]} />}
        <div className="flex items-center gap-0.5">
          <span className="w-16 shrink-0 text-right text-[10px] uppercase tracking-wide text-lab-faint">match</span>
          {cols.map((i) => {
            const ok = aliceBases[i] === bobBases[i];
            return (
              <span
                key={i}
                className={`h-2 w-5 rounded-sm ${ok ? "bg-accent-green/70" : "bg-lab-raised"}`}
                title={ok ? "bases match — kept" : "bases differ — discarded"}
              />
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-lab-faint">
        Showing first {n} of {aliceBases.length} transmissions · <span className="text-accent-green">green = kept</span> ({matched}/{n} shown)
      </p>
    </div>
  );
}
