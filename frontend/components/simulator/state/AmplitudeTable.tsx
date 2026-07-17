"use client";

// Shared per-basis-state table used by the Overview, Probabilities, and
// Phases quantum-state views. Handles up to the backend's hard payload cap
// (4096 amplitude rows at state_detail="full") without ever mounting
// thousands of DOM rows: the body is windowed -- a fixed row height plus two
// spacer rows means only the ~viewport's worth of rows exists in the DOM at
// any moment, while scrollbar geometry and screen-reader row counts
// (aria-rowcount/aria-rowindex) still describe the full list. Search,
// zero-probability filtering, and a technical-details column toggle
// (Re/Im/|amp|/radians) are all client-side views over the already-bounded
// backend payload; the JSON/CSV export always carries the complete list.
import { useMemo, useRef, useState } from "react";
import type { AmplitudeEntry } from "@/lib/labTypes";
import {
  complexMagnitude,
  formatPhaseDegrees,
  formatPhaseRadians,
  formatProbabilityPercent,
  phaseToHslColor,
} from "@/lib/stateAnalysisFormat";

const ROW_HEIGHT = 32; // px -- keep in sync with the h-8 row class below
const VISIBLE_WINDOW = 12; // rows tall the scroll container is at most
const OVERSCAN = 6;
const CONTROLS_THRESHOLD = 8; // below this, filter controls add noise, not value
const ZERO_THRESHOLD = 1e-10;

function formatSigned(value: number): string {
  return (value >= 0 ? "+" : "") + value.toFixed(4);
}

export function AmplitudeTable({
  entries,
  showAmplitude = true,
  showPhase = true,
  maxRows,
}: {
  entries: AmplitudeEntry[];
  showAmplitude?: boolean;
  showPhase?: boolean;
  /** Optional simple cap for embedding a short summary (e.g. Overview's top states); disables controls and virtualization. */
  maxRows?: number;
}) {
  const [search, setSearch] = useState("");
  const [hideZero, setHideZero] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const summaryMode = typeof maxRows === "number";
  // Search and zero-filtering only earn their space with many rows; the
  // Re/Im/radians detail toggle is useful for any amplitude-bearing table.
  const filterControls = !summaryMode && entries.length >= CONTROLS_THRESHOLD;
  const detailControl = !summaryMode && showAmplitude && entries.some((entry) => entry.amplitude !== null);
  const controlsEnabled = filterControls || detailControl;

  const filtered = useMemo(() => {
    if (summaryMode) return entries.slice(0, maxRows);
    let rows = entries;
    if (filterControls && hideZero) rows = rows.filter((entry) => entry.probability > ZERO_THRESHOLD);
    const query = search.trim();
    if (filterControls && query) rows = rows.filter((entry) => entry.basis.includes(query));
    return rows;
  }, [entries, summaryMode, maxRows, filterControls, hideZero, search]);

  if (entries.length === 0) {
    return <p className="py-6 text-center text-xs text-lab-faint">No basis states meet the display threshold.</p>;
  }

  const hasAmplitude = showAmplitude && filtered.some((entry) => entry.amplitude !== null);
  const hasPhase = showPhase && filtered.some((entry) => entry.phase_radians !== null);
  const detailed = hasAmplitude && showDetails;
  const maxProbability = filtered.reduce((max, entry) => Math.max(max, entry.probability), 0) || 1;

  // Windowing: with few rows, render everything (no scroll container churn).
  const virtualized = !summaryMode && filtered.length > VISIBLE_WINDOW + OVERSCAN;
  const startIndex = virtualized ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN) : 0;
  const endIndex = virtualized ? Math.min(filtered.length, startIndex + VISIBLE_WINDOW + OVERSCAN * 2) : filtered.length;
  const visible = filtered.slice(startIndex, endIndex);
  const topPad = startIndex * ROW_HEIGHT;
  const bottomPad = (filtered.length - endIndex) * ROW_HEIGHT;

  const columnCount = 2 + (hasAmplitude ? 1 : 0) + (detailed ? 3 : 0) + (hasPhase ? (detailed ? 2 : 1) : 0);

  return (
    <div>
      {controlsEnabled && (
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {filterControls && (
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Filter basis states"
              placeholder="Filter basis, e.g. 01"
              className="min-h-8 w-36 rounded-md border border-lab-border bg-lab-bg px-2 font-mono text-[11px] text-lab-text outline-none placeholder:text-lab-faint focus:border-accent-cyan"
            />
          )}
          {filterControls && (
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-lab-muted">
              <input type="checkbox" checked={hideZero} onChange={(event) => setHideZero(event.target.checked)} className="h-3.5 w-3.5 accent-cyan-500" />
              Hide zero-probability states
            </label>
          )}
          {detailControl && hasAmplitude && (
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-lab-muted">
              <input type="checkbox" checked={showDetails} onChange={(event) => setShowDetails(event.target.checked)} className="h-3.5 w-3.5 accent-cyan-500" />
              Re / Im / radians columns
            </label>
          )}
          {filterControls && <span className="ml-auto font-mono text-[10px] text-lab-faint">{filtered.length} of {entries.length} states</span>}
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={virtualized ? (event) => setScrollTop(event.currentTarget.scrollTop) : undefined}
        className="overflow-x-auto overflow-y-auto"
        style={virtualized ? { maxHeight: `${(VISIBLE_WINDOW + 1.2) * ROW_HEIGHT}px` } : undefined}
      >
        <table className="w-full min-w-[26rem] border-collapse text-left text-[11px]" aria-rowcount={filtered.length + 1}>
          <thead className="sticky top-0 z-[1] bg-lab-surface">
            <tr className="border-b border-lab-border text-lab-faint" aria-rowindex={1}>
              <th scope="col" className="py-1.5 pr-3 font-medium">Basis state</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">Probability</th>
              {hasAmplitude && <th scope="col" className="py-1.5 pr-3 font-medium">Amplitude</th>}
              {detailed && <th scope="col" className="py-1.5 pr-3 font-medium">Re</th>}
              {detailed && <th scope="col" className="py-1.5 pr-3 font-medium">Im</th>}
              {detailed && <th scope="col" className="py-1.5 pr-3 font-medium">|amp|</th>}
              {hasPhase && <th scope="col" className="py-1.5 pr-3 font-medium">Phase</th>}
              {detailed && hasPhase && <th scope="col" className="py-1.5 pr-3 font-medium">Phase (rad)</th>}
            </tr>
          </thead>
          <tbody>
            {topPad > 0 && <tr aria-hidden="true" style={{ height: `${topPad}px` }}><td colSpan={columnCount} className="p-0" /></tr>}
            {visible.map((entry, offset) => (
              <tr key={`${entry.index ?? entry.basis}-${startIndex + offset}`} aria-rowindex={startIndex + offset + 2} className="h-8 border-b border-lab-border/60">
                <td className="whitespace-nowrap pr-3 font-mono text-lab-text">|{entry.basis}⟩</td>
                <td className="whitespace-nowrap pr-3">
                  <div className="flex items-center gap-2">
                    <div className="relative h-2 w-16 shrink-0 overflow-hidden rounded-sm bg-lab-raised" role="meter" aria-label={`Probability of |${entry.basis}⟩`} aria-valuemin={0} aria-valuemax={1} aria-valuenow={entry.probability}>
                      <div className="h-full rounded-sm bg-accent-cyan" style={{ width: `${(entry.probability / maxProbability) * 100}%` }} />
                    </div>
                    <span className="font-mono text-lab-muted">{formatProbabilityPercent(entry.probability)}</span>
                  </div>
                </td>
                {hasAmplitude && (
                  <td className="whitespace-nowrap pr-3 font-mono text-lab-muted">
                    {entry.amplitude ? `${formatSigned(entry.amplitude.re)} ${entry.amplitude.im >= 0 ? "+" : "−"} ${Math.abs(entry.amplitude.im).toFixed(4)}i` : "—"}
                  </td>
                )}
                {detailed && <td className="whitespace-nowrap pr-3 font-mono text-lab-muted">{entry.amplitude ? formatSigned(entry.amplitude.re) : "—"}</td>}
                {detailed && <td className="whitespace-nowrap pr-3 font-mono text-lab-muted">{entry.amplitude ? formatSigned(entry.amplitude.im) : "—"}</td>}
                {detailed && <td className="whitespace-nowrap pr-3 font-mono text-lab-muted">{entry.amplitude ? complexMagnitude(entry.amplitude).toFixed(4) : "—"}</td>}
                {hasPhase && (
                  <td className="whitespace-nowrap pr-3">
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
                {detailed && hasPhase && (
                  <td className="whitespace-nowrap pr-3 font-mono text-lab-muted">{entry.phase_radians !== null ? formatPhaseRadians(entry.phase_radians) : "—"}</td>
                )}
              </tr>
            ))}
            {bottomPad > 0 && <tr aria-hidden="true" style={{ height: `${bottomPad}px` }}><td colSpan={columnCount} className="p-0" /></tr>}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="py-4 text-center text-[11px] text-lab-faint" role="status">No basis states match the current filter.</p>
        )}
      </div>

      {summaryMode && entries.length > (maxRows ?? 0) && (
        <p className="pt-2 text-[10px] text-lab-faint">+ {entries.length - (maxRows ?? 0)} more basis states -- see the Probabilities tab or use the export action for the complete list.</p>
      )}
    </div>
  );
}
