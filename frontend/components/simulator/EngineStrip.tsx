"use client";

// Compact horizontal engine comparison (reference study #1 Linear command
// palette groups, #9 IBM Composer method chips): five lanes always visible at
// a glance via a colored state dot, one lane's full reasoning expands below on
// click instead of five permanently-expanded cards competing for space.
import { useState } from "react";
import { buildLanes, type EngineLane, type LaneState } from "@/lib/engineLanes";
import { formatEngineName } from "@/lib/formatting";
import type { CircuitAnalysis, EngineId, EnginesResponse } from "@/lib/labTypes";
import { Badge, type BadgeTone } from "@/components/ui/primitives";

const STATE_TONE: Record<LaneState, BadgeTone> = {
  fit: "green",
  caution: "amber",
  blocked: "red",
  external: "violet",
  pending: "neutral",
};

const STATE_DOT: Record<LaneState, string> = {
  fit: "bg-safe-DEFAULT",
  caution: "bg-warn-DEFAULT",
  blocked: "bg-danger-DEFAULT",
  external: "bg-quantum-500",
  pending: "bg-ink-400",
};

export function EngineStrip({
  analysis,
  engines,
  selectedEngine,
  maxMemoryMb,
  noiseEnabled,
  allowApproximation,
  disabled,
  onSelectEngine,
  onHoverLane,
}: {
  analysis: CircuitAnalysis | null;
  engines: EnginesResponse | null;
  selectedEngine: EngineId;
  maxMemoryMb: number;
  noiseEnabled: boolean;
  allowApproximation: boolean;
  disabled?: boolean;
  onSelectEngine: (engine: EngineId) => void;
  onHoverLane?: (laneId: string | null) => void;
}) {
  const lanes = buildLanes({ analysis, engines, selectedEngine, maxMemoryMb, noiseEnabled, allowApproximation });
  const [expandedId, setExpandedId] = useState<string | null>(lanes.find((lane) => lane.selected)?.id ?? null);
  const expanded = lanes.find((lane) => lane.id === expandedId) ?? null;

  const activate = (lane: EngineLane) => {
    setExpandedId(lane.id);
    if (lane.engine && lane.available !== false && !disabled) onSelectEngine(lane.engine);
  };

  return (
    <div className="rounded-xl2 border border-line bg-surface shadow-floating">
      <div className="flex items-center justify-between gap-2 border-b border-line-hairline px-3 py-2 sm:px-4">
        <p className="eyebrow">Engine lanes</p>
        <button
          type="button"
          aria-pressed={selectedEngine === "auto"}
          disabled={disabled}
          onClick={() => onSelectEngine("auto")}
          className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${selectedEngine === "auto" ? "border-accent-500 bg-accent-50 text-accent-700" : "border-line text-ink-500 hover:border-accent-300"}`}
        >
          Auto router{selectedEngine === "auto" && " ✓"}
        </button>
      </div>

      <div role="tablist" aria-label="Simulation engine lanes" className="grid grid-cols-5 gap-px bg-line-hairline">
        {lanes.map((lane) => {
          const canSelect = lane.engine !== null && lane.available !== false && !disabled;
          return (
            <button
              key={lane.id}
              type="button"
              role="tab"
              aria-selected={expandedId === lane.id}
              disabled={lane.engine !== null && !canSelect}
              onClick={() => activate(lane)}
              onMouseEnter={() => onHoverLane?.(lane.id)}
              onMouseLeave={() => onHoverLane?.(null)}
              className={`flex min-h-[4.5rem] flex-col items-center justify-center gap-1 bg-surface px-1.5 py-2 text-center transition disabled:cursor-not-allowed disabled:opacity-45 ${expandedId === lane.id ? "bg-accent-50" : "hover:bg-canvas-dim"}`}
            >
              <span className="flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[lane.state]}`} aria-hidden="true" />
                <span className="font-mono text-[11px] font-bold text-ink-900">{lane.shortName}</span>
                {lane.selected && <span className="text-accent-600" aria-label="currently selected">●</span>}
              </span>
              <span className="text-[9px] leading-3 text-ink-500">{lane.verdict}</span>
            </button>
          );
        })}
      </div>

      {expanded && (
        <div className="border-t border-line-hairline px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-ink-900">{expanded.name}</h3>
              <Badge tone={STATE_TONE[expanded.state]}>{expanded.verdict}</Badge>
              {expanded.recommended && <Badge tone="green">recommended</Badge>}
              {expanded.available === false && <Badge tone="red">runtime unavailable</Badge>}
            </div>
            {expanded.engine && (
              <button
                type="button"
                disabled={!(expanded.available !== false && !disabled)}
                onClick={() => expanded.engine && onSelectEngine(expanded.engine)}
                className="rounded-md border border-accent-300 bg-accent-50 px-2 py-1 text-[10px] font-semibold text-accent-700 transition hover:bg-accent-100 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {expanded.selected ? `Selected as ${formatEngineName(selectedEngine)}` : "Select this lane"}
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-ink-500">{expanded.reason}</p>
          <div className="mt-2 grid gap-2 border-t border-line-hairline pt-2 sm:grid-cols-3">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-400">Scaling</p>
              <p className="mt-0.5 font-mono text-[10px] text-ink-700">{expanded.scaling}</p>
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-400">Ideal for</p>
              <p className="mt-0.5 text-[10px] leading-4 text-ink-500">{expanded.ideal}</p>
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-400">Limitation</p>
              <p className="mt-0.5 text-[10px] leading-4 text-ink-500">{expanded.limitation}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
