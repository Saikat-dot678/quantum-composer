"use client";

import { useMemo, useRef, useState } from "react";
import { Download, LocateFixed, Minus, Plus, Scan } from "lucide-react";
import type { BackendDetail, RoutingSwap, TranspiledLayout } from "@/lib/hardwareTypes";
import { formatPercent, topologyPoints } from "@/lib/hardwareFormat";
import { Button } from "@/components/ui/primitives";

export type TopologyOverlay = "connectivity" | "logical" | "activity" | "readout" | "gate-error" | "t1" | "t2" | "duration" | "routing";

const WIDTH = 760;
const HEIGHT = 430;

const OVERLAYS: Array<{ id: TopologyOverlay; label: string }> = [
  { id: "connectivity", label: "Connectivity" },
  { id: "logical", label: "Logical layout" },
  { id: "activity", label: "Circuit activity" },
  { id: "readout", label: "Readout error" },
  { id: "gate-error", label: "2q gate error" },
  { id: "t1", label: "T1" },
  { id: "t2", label: "T2" },
  { id: "duration", label: "Duration" },
  { id: "routing", label: "Routing / SWAPs" },
];

function scaleColor(value: number | null, values: number[], hue: number): string {
  if (value === null || values.length === 0) return "#ffffff";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const t = (value - min) / (max - min || 1);
  return `hsl(${hue}, 72%, ${91 - t * 46}%)`;
}

export function TopologyView({
  detail,
  layout,
  usedEdges,
  routingSwaps,
  selectedLogical,
  selectedPhysical,
  selectedEdge,
  onSelectLogical,
  onSelectPhysical,
  onSelectEdge,
}: {
  detail: BackendDetail;
  layout: TranspiledLayout | null;
  usedEdges: number[][];
  routingSwaps: RoutingSwap[];
  selectedLogical: number | null;
  selectedPhysical: number | null;
  selectedEdge: [number, number] | null;
  onSelectLogical: (logical: number | null) => void;
  onSelectPhysical: (physical: number | null) => void;
  onSelectEdge: (edge: [number, number] | null) => void;
}) {
  const [overlay, setOverlay] = useState<TopologyOverlay>("logical");
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [search, setSearch] = useState("");
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const points = useMemo(() => topologyPoints(detail, WIDTH, HEIGHT), [detail]);
  const pointMap = useMemo(() => new Map(points.map((point) => [point.qubit, point])), [points]);
  const physicalToLogical = useMemo(() => {
    const map = new Map<number, number>();
    layout?.final?.forEach((physical, logical) => map.set(physical, logical));
    return map;
  }, [layout]);
  const active = new Set(layout?.active_physical_qubits ?? []);
  const used = new Set(usedEdges.map((edge) => `${edge[0]}:${edge[1]}`));
  const swapped = new Set(routingSwaps.flatMap((event) => [`${event.physical_a}:${event.physical_b}`, `${event.physical_b}:${event.physical_a}`]));
  const readouts = detail.qubit_calibrations.flatMap((item) => item.readout_error === null ? [] : [item.readout_error]);
  const t1Values = detail.qubit_calibrations.flatMap((item) => item.t1_us === null ? [] : [item.t1_us]);
  const t2Values = detail.qubit_calibrations.flatMap((item) => item.t2_us === null ? [] : [item.t2_us]);
  const edgeErrors = detail.edge_calibrations.flatMap((item) => item.error === null ? [] : [item.error]);
  const durations = detail.edge_calibrations.flatMap((item) => item.duration_ns === null ? [] : [item.duration_ns]);

  function resetView() {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  function jumpToQubit() {
    const value = Number.parseInt(search.replace(/^q/i, ""), 10);
    const point = pointMap.get(value);
    if (!point) return;
    setScale(1.8);
    setOffset({ x: WIDTH / 2 - point.x * 1.8, y: HEIGHT / 2 - point.y * 1.8 });
    onSelectPhysical(value);
    const logical = physicalToLogical.get(value);
    onSelectLogical(logical ?? null);
  }

  function exportSvg() {
    if (!svgRef.current) return;
    const source = new XMLSerializer().serializeToString(svgRef.current);
    const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${detail.summary.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-topology.svg`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const edgeCalibration = (control: number, target: number) =>
    detail.edge_calibrations.find((edge) => edge.control === control && edge.target === target) ?? null;

  return (
    <section aria-labelledby="topology-heading" className="min-w-0 rounded-xl2 border border-line bg-surface shadow-floating">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-hairline px-4 py-3">
        <div>
          <p className="eyebrow text-accent-700">Physical target</p>
          <h2 id="topology-heading" className="mt-0.5 text-sm font-semibold text-ink-900">{detail.summary.name} topology</h2>
          <p className="mt-1 text-[11px] text-ink-500">
            {detail.coordinates_schematic ? "Schematic topology layout" : "Coordinates supplied by the target definition"}
            {detail.summary.calibration_timestamp ? ` · calibration ${detail.summary.calibration_timestamp}` : " · calibration timestamp unavailable"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="quiet" size="sm" onClick={() => setScale((value) => Math.max(0.55, value - 0.2))} aria-label="Zoom topology out"><Minus className="h-3.5 w-3.5" /></Button>
          <Button variant="quiet" size="sm" onClick={resetView} aria-label="Fit topology"><Scan className="h-3.5 w-3.5" /></Button>
          <Button variant="quiet" size="sm" onClick={() => setScale((value) => Math.min(3, value + 0.2))} aria-label="Zoom topology in"><Plus className="h-3.5 w-3.5" /></Button>
          <Button variant="quiet" size="sm" onClick={exportSvg}><Download className="h-3.5 w-3.5" /> SVG</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-line-hairline px-3 py-2" role="group" aria-label="Topology overlay">
        {OVERLAYS.map((item) => (
          <button key={item.id} type="button" aria-pressed={overlay === item.id} onClick={() => setOverlay(item.id)} className={`min-h-8 rounded-md px-2 text-[10px] font-semibold ${overlay === item.id ? "bg-accent-50 text-accent-700 ring-1 ring-accent-200" : "text-ink-500 hover:bg-ink-50 hover:text-ink-900"}`}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-line-hairline px-3 py-2">
        <label className="sr-only" htmlFor="topology-qubit-search">Jump to physical qubit</label>
        <input id="topology-qubit-search" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") jumpToQubit(); }} placeholder="Jump to q…" className="min-h-8 w-28 rounded-md border border-line bg-surface px-2 font-mono text-[11px] text-ink-900" />
        <Button variant="secondary" size="sm" onClick={jumpToQubit}><LocateFixed className="h-3.5 w-3.5" /> Jump</Button>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-[10px] text-ink-500" aria-label="Topology legend">
          <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full border-2 border-accent-600 align-middle" />mapped</span>
          <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full border border-dashed border-ink-400 align-middle" />unused</span>
          <span><i className="mr-1 inline-block w-4 border-t-2 border-dashed border-warn align-middle" />routing</span>
        </div>
      </div>

      <div className="min-w-0 overflow-hidden bg-[radial-gradient(circle,#e4e4e7_1px,transparent_1px)] bg-[length:18px_18px]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`${detail.summary.name} ${detail.summary.num_qubits}-qubit coupling topology`}
          className="block h-auto min-h-[20rem] w-full touch-none"
          onWheel={(event) => { event.preventDefault(); setScale((value) => Math.max(0.55, Math.min(3, value * (event.deltaY > 0 ? 0.9 : 1.1)))); }}
          onPointerDown={(event) => { if (event.target === event.currentTarget) { drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }; event.currentTarget.setPointerCapture(event.pointerId); } }}
          onPointerMove={(event) => { if (drag.current) setOffset({ x: drag.current.ox + event.clientX - drag.current.x, y: drag.current.oy + event.clientY - drag.current.y }); }}
          onPointerUp={() => { drag.current = null; }}
        >
          <defs>
            <marker id="topology-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 8 4 0 8Z" fill="#71717a" /></marker>
            <pattern id="active-pattern" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V5" stroke="#4f46e5" strokeWidth="1.5" /></pattern>
          </defs>
          <g transform={`translate(${offset.x} ${offset.y}) scale(${scale})`}>
            {detail.coupling_edges.map(([control, target], index) => {
              const from = pointMap.get(control);
              const to = pointMap.get(target);
              if (!from || !to) return null;
              const calibration = edgeCalibration(control, target);
              const isUsed = used.has(`${control}:${target}`);
              const isSwap = swapped.has(`${control}:${target}`);
              const isSelected = selectedEdge?.[0] === control && selectedEdge?.[1] === target;
              let stroke = "#a1a1aa";
              if (overlay === "activity" && isUsed) stroke = "#0891b2";
              if (overlay === "routing" && isSwap) stroke = "#d97706";
              if (overlay === "gate-error") stroke = scaleColor(calibration?.error ?? null, edgeErrors, 18);
              if (overlay === "duration") stroke = scaleColor(calibration?.duration_ns ?? null, durations, 270);
              return (
                <line
                  key={`${control}-${target}-${index}`}
                  x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                  stroke={isSelected ? "#18181b" : stroke}
                  strokeWidth={(isUsed || isSwap || isSelected) ? 4 / scale : 2 / scale}
                  strokeDasharray={isSwap ? `${7 / scale} ${4 / scale}` : undefined}
                  markerEnd={!detail.summary.simulator || !detail.summary.name.startsWith("generic_") ? "url(#topology-arrow)" : undefined}
                  className="cursor-pointer"
                  onClick={(event) => { event.stopPropagation(); onSelectEdge([control, target]); }}
                >
                  <title>{`q${control} → q${target}${calibration?.gate ? ` · ${calibration.gate}` : ""} · error ${formatPercent(calibration?.error ?? null)} · ${calibration?.duration_ns?.toFixed(1) ?? "—"} ns${isUsed ? " · used by mapped circuit" : ""}${isSwap ? " · routing SWAP edge" : ""}`}</title>
                </line>
              );
            })}
            {points.map((point) => {
              const logical = physicalToLogical.get(point.qubit);
              const calibration = detail.qubit_calibrations.find((item) => item.qubit === point.qubit);
              const isActive = active.has(point.qubit);
              const selected = selectedPhysical === point.qubit || (selectedLogical !== null && logical === selectedLogical);
              let fill = isActive ? "url(#active-pattern)" : "#ffffff";
              if (overlay === "readout") fill = scaleColor(calibration?.readout_error ?? null, readouts, 18);
              if (overlay === "t1") fill = scaleColor(calibration?.t1_us ?? null, t1Values, 190);
              if (overlay === "t2") fill = scaleColor(calibration?.t2_us ?? null, t2Values, 250);
              if (overlay === "logical" && logical !== undefined) fill = "#eef2ff";
              return (
                <g key={point.qubit} transform={`translate(${point.x} ${point.y})`} className="cursor-pointer" onClick={(event) => { event.stopPropagation(); onSelectEdge(null); onSelectPhysical(point.qubit); onSelectLogical(logical ?? null); }}>
                  <circle r={selected ? 16 / scale : 13 / scale} fill={fill} stroke={selected ? "#4f46e5" : isActive ? "#0891b2" : "#71717a"} strokeWidth={(selected ? 3 : 1.5) / scale} strokeDasharray={isActive ? undefined : `${3 / scale} ${2 / scale}`} />
                  <text textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-mono)" fontSize={9 / scale} fill="#18181b">{point.qubit}</text>
                  {logical !== undefined && <text x={15 / scale} y={-13 / scale} fontFamily="var(--font-mono)" fontSize={8 / scale} fontWeight="700" fill="#4f46e5">L{logical}</text>}
                  <title>{`Physical q${point.qubit}${logical !== undefined ? ` · logical q${logical}` : " · unused by layout"} · readout ${formatPercent(calibration?.readout_error ?? null)} · T1 ${calibration?.t1_us?.toFixed(1) ?? "—"} µs · T2 ${calibration?.t2_us?.toFixed(1) ?? "—"} µs`}</title>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {(selectedPhysical !== null || selectedEdge) && (
        <div className="border-t border-line-hairline px-4 py-2 text-[11px] text-ink-600" role="status">
          {selectedPhysical !== null && `Physical q${selectedPhysical}${physicalToLogical.has(selectedPhysical) ? ` carries logical q${physicalToLogical.get(selectedPhysical)}` : " is not in the final logical layout"}.`}
          {selectedEdge && ` Edge q${selectedEdge[0]} → q${selectedEdge[1]}${used.has(`${selectedEdge[0]}:${selectedEdge[1]}`) ? " is used by a transpiled two-qubit operation." : " is available but unused by this mapping."}`}
        </div>
      )}
    </section>
  );
}
