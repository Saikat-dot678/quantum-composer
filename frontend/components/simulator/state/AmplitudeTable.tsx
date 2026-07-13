"use client";

// Shared per-basis-state table used by the Overview, Probabilities, and
// Phases quantum-state views. Bounded to `maxRows` rendered rows (the same
// "cap + N more" strategy HistogramPanel already uses for measurement
// counts) rather than a virtualized-scroll widget -- the backend already
// truncates to top_k/max_returned_amplitudes before this ever reaches the
// browser, so the remaining risk is only a moderately long list, not an
// unbounded one. A full CSV/JSON export remains available for anything not
// shown here (see lib/stateAnalysisFormat.ts).
import type { AmplitudeEntry } from "@/lib/labTypes";
import { formatComplex, formatPhaseDegrees, formatProbabilityPercent, phaseToHslColor } from "@/lib/stateAnalysisFormat";

export function AmplitudeTable({
  entries,
  maxRows = 24,
  showAmplitude = true,
  showPhase = true,
}: {
  entries: AmplitudeEntry[];
  maxRows?: number;
  showAmplitude?: boolean;
  showPhase?: boolean;
}) {
  if (entries.length === 0) {
    return <p className="py-6 text-center text-xs text-lab-faint">No basis states meet the display threshold.</p>;
  }
  const hasAmplitude = showAmplitude && entries.some((entry) => entry.amplitude !== null);
  const hasPhase = showPhase && entries.some((entry) => entry.phase_radians !== null);
  const shown = entries.slice(0, maxRows);
  const maxProbability = shown.reduce((max, entry) => Math.max(max, entry.probability), 0) || 1;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem] border-collapse text-left text-[11px]">
          <thead>
            <tr className="border-b border-lab-border text-lab-faint">
              <th scope="col" className="py-1.5 pr-3 font-medium">Basis state</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">Probability</th>
              {hasAmplitude && <th scope="col" className="py-1.5 pr-3 font-medium">Amplitude</th>}
              {hasPhase && <th scope="col" className="py-1.5 pr-3 font-medium">Phase</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((entry, rowIndex) => (
              <tr key={`${entry.index ?? entry.basis}-${rowIndex}`} className="border-b border-lab-border/60">
                <td className="py-1.5 pr-3 font-mono text-lab-text">|{entry.basis}⟩</td>
                <td className="py-1.5 pr-3">
                  <div className="flex items-center gap-2">
                    <div className="relative h-2 w-16 shrink-0 overflow-hidden rounded-sm bg-lab-raised" role="meter" aria-label={`Probability of |${entry.basis}⟩`} aria-valuemin={0} aria-valuemax={1} aria-valuenow={entry.probability}>
                      <div className="h-full rounded-sm bg-accent-cyan" style={{ width: `${(entry.probability / maxProbability) * 100}%` }} />
                    </div>
                    <span className="font-mono text-lab-muted">{formatProbabilityPercent(entry.probability)}</span>
                  </div>
                </td>
                {hasAmplitude && (
                  <td className="py-1.5 pr-3 font-mono text-lab-muted">{entry.amplitude ? formatComplex(entry.amplitude) : "—"}</td>
                )}
                {hasPhase && (
                  <td className="py-1.5 pr-3">
                    {entry.phase_radians !== null ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-lab-border" aria-hidden="true" style={{ backgroundColor: phaseToHslColor(entry.phase_radians) }} />
                        <span className="font-mono text-lab-muted">{formatPhaseDegrees(entry.phase_degrees ?? 0)}</span>
                      </span>
                    ) : (
                      <span className="text-lab-faint">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {entries.length > shown.length && (
        <p className="pt-2 text-[10px] text-lab-faint">+ {entries.length - shown.length} more basis states not shown here -- use the export action for the complete list.</p>
      )}
    </div>
  );
}
