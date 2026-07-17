"use client";

import type { CompareResponse, TranspileResponse } from "@/lib/hardwareTypes";
import { formatAge, formatPercent, logicalMappingRows } from "@/lib/hardwareFormat";
import { Badge, Callout } from "@/components/ui/primitives";
import { CircuitDiagram } from "@/components/results/CircuitDiagram";

function delta(after: number, before: number): string {
  const change = after - before;
  return `${change >= 0 ? "+" : ""}${change.toLocaleString()}`;
}

export function MappingResults({
  result,
  selectedLogical,
  selectedPhysical,
  onSelectLogical,
  onSelectPhysical,
  onSelectEdge,
}: {
  result: TranspileResponse;
  selectedLogical: number | null;
  selectedPhysical: number | null;
  onSelectLogical: (value: number | null) => void;
  onSelectPhysical: (value: number | null) => void;
  onSelectEdge: (value: [number, number] | null) => void;
}) {
  const rows = logicalMappingRows(result.layout);
  return (
    <section aria-labelledby="mapping-results-heading" className="rounded-xl2 border border-line bg-surface shadow-floating">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-hairline px-4 py-3">
        <div>
          <p className="eyebrow text-accent-700">Mapped circuit</p>
          <h2 id="mapping-results-heading" className="mt-0.5 text-sm font-semibold text-ink-900">{result.target_name}</h2>
          <p className="mt-1 text-[11px] text-ink-500">Optimization {result.optimization_level} · seed {result.seed ?? "random"} · {result.transpile_time_ms.toFixed(1)} ms transpilation</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={result.transpiled.swap_count ? "amber" : "green"}>{result.transpiled.swap_count} inserted SWAP{result.transpiled.swap_count === 1 ? "" : "s"}</Badge>
          <Badge tone="neutral">{result.layout.active_physical_qubits.length} active physical qubits</Badge>
        </div>
      </div>

      <div className="grid border-b border-line-hairline sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Depth", result.original.depth, result.transpiled.depth],
          ["Operations", result.original.size, result.transpiled.size],
          ["Two-qubit gates", result.original.two_qubit_gates, result.transpiled.two_qubit_gates],
          ["Measurements", result.original.measurements, result.transpiled.measurements],
        ].map(([label, before, after]) => (
          <div key={String(label)} className="border-b border-line-hairline px-4 py-3 last:border-b-0 sm:odd:border-r lg:border-b-0 lg:not-last:border-r">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
            <p className="mt-1 font-mono text-sm text-ink-900">{Number(before).toLocaleString()} → {Number(after).toLocaleString()}</p>
            <p className={`mt-0.5 font-mono text-[10px] ${Number(after) > Number(before) ? "text-warn" : "text-safe"}`}>{delta(Number(after), Number(before))}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-ink-900">Logical-to-physical layout</h3>
          <p className="mt-1 text-[10px] leading-4 text-ink-500">Select either side to highlight the same mapping on the topology.</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[22rem] border-collapse text-left text-[11px]">
              <thead><tr className="border-b border-line text-ink-400"><th className="py-1.5 pr-3 font-medium">Logical</th><th className="py-1.5 pr-3 font-medium">Initial physical</th><th className="py-1.5 pr-3 font-medium">Final physical</th><th className="py-1.5 font-medium">Movement</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.logical} className={`border-b border-line-hairline ${selectedLogical === row.logical || selectedPhysical === row.final ? "bg-accent-50" : ""}`}>
                    <td className="py-1.5 pr-3"><button type="button" className="min-h-8 rounded px-2 font-mono font-semibold text-accent-700 hover:bg-accent-100" onClick={() => { onSelectEdge(null); onSelectLogical(row.logical); onSelectPhysical(row.final); }}>q{row.logical}</button></td>
                    <td className="py-1.5 pr-3 font-mono text-ink-600">{row.initial === null ? "—" : `q${row.initial}`}</td>
                    <td className="py-1.5 pr-3"><button type="button" disabled={row.final === null} className="min-h-8 rounded px-2 font-mono text-ink-900 hover:bg-ink-50" onClick={() => { onSelectEdge(null); onSelectLogical(row.logical); onSelectPhysical(row.final); }}>{row.final === null ? "—" : `q${row.final}`}</button></td>
                    <td className="py-1.5 font-mono text-ink-500">{row.initial === row.final ? "fixed" : `${row.initial ?? "?"} → ${row.final ?? "?"}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-ink-900">Routing timeline</h3>
          {result.routing_swaps.length ? (
            <ol className="mt-2 space-y-1.5">
              {result.routing_swaps.map((swap) => (
                <li key={swap.sequence}>
                  <button type="button" onClick={() => { onSelectLogical(null); onSelectPhysical(swap.physical_a); onSelectEdge([swap.physical_a, swap.physical_b]); }} className="flex min-h-10 w-full items-center gap-3 rounded-lg border border-line-hairline px-3 py-2 text-left hover:border-warn">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-warn-bg font-mono text-[10px] font-semibold text-warn">{swap.sequence}</span>
                    <span className="min-w-0"><strong className="font-mono text-[11px] text-ink-900">SWAP q{swap.physical_a} ↔ q{swap.physical_b}</strong><span className="block text-[10px] leading-4 text-ink-500">{swap.explanation}</span></span>
                  </button>
                </li>
              ))}
            </ol>
          ) : <p className="mt-2 rounded-lg border border-safe-border bg-safe-bg p-3 text-[11px] text-safe-text">No routing SWAP was required for this target and layout.</p>}
          {result.transpiled.used_edges.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Used physical edges</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {result.transpiled.used_edges.map(([a, b], index) => <button key={`${a}-${b}-${index}`} type="button" onClick={() => { onSelectLogical(null); onSelectPhysical(a); onSelectEdge([a, b]); }} className="min-h-8 rounded-md border border-line px-2 font-mono text-[10px] text-ink-600 hover:border-accent-500">q{a}→q{b}</button>)}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3 border-t border-line-hairline p-4 lg:grid-cols-2">
        <div className="rounded-lg border border-line-hairline bg-surface-sunken p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Estimated duration</p>
          <p className="mt-1 font-mono text-sm text-ink-900">{result.estimated_duration_us === null ? "not available" : `${result.estimated_duration_us.toFixed(3)} µs / shot`}</p>
          <p className="mt-1 text-[10px] leading-4 text-ink-500">Derived from target instruction durations along the scheduled critical path; omitted if calibration is incomplete.</p>
        </div>
        <div className="rounded-lg border border-line-hairline bg-surface-sunken p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Heuristic error product</p>
          <p className="mt-1 font-mono text-sm text-ink-900">{formatPercent(result.heuristic_error?.success_probability ?? null)}</p>
          <p className="mt-1 text-[10px] leading-4 text-ink-500">{result.heuristic_error?.formula ?? "Calibration unavailable"}. {result.heuristic_error?.assumptions}</p>
        </div>
      </div>

      <details className="border-t border-line-hairline px-4 py-3">
          <summary className="cursor-pointer text-xs font-semibold text-ink-900">Circuit diagrams</summary>
          <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-2">
            <CircuitDiagram diagram={result.original_circuit_diagram} title="Logical circuit" warning={result.warnings.find((warning) => warning.startsWith("Logical circuit:"))} />
            <CircuitDiagram diagram={result.transpiled_circuit_diagram} title="Transpiled physical circuit" warning={result.warnings.find((warning) => warning.startsWith("Transpiled circuit:"))} />
          </div>
      </details>

      {result.warnings.length > 0 && <div className="border-t border-line-hairline p-4"><Callout tone="warning" title="Mapping warnings"><ul className="list-disc space-y-1 pl-4">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></Callout></div>}
    </section>
  );
}

export function BackendComparison({ comparison }: { comparison: CompareResponse }) {
  return (
    <section aria-labelledby="comparison-heading" className="rounded-xl2 border border-line bg-surface shadow-floating">
      <div className="border-b border-line-hairline px-4 py-3"><p className="eyebrow text-accent-700">Target study</p><h2 id="comparison-heading" className="mt-0.5 text-sm font-semibold text-ink-900">Backend comparison</h2></div>
      <div className="overflow-x-auto p-4">
        <table className="w-full min-w-[66rem] border-collapse text-left text-[11px]">
          <thead><tr className="border-b border-line text-ink-400">{["Target", "Capacity", "Depth", "2q gates", "SWAPs", "Active", "Duration", "Readout err.", "Used-edge err.", "Queue", "Calibration"].map((label) => <th key={label} className="py-2 pr-4 font-medium">{label}</th>)}</tr></thead>
          <tbody>{comparison.entries.map((entry) => <tr key={`${entry.target_source}:${entry.target_name}`} className="border-b border-line-hairline"><td className="max-w-64 break-words py-2 pr-4 font-semibold text-ink-900">{entry.target_name}{!entry.ok && <span className="block text-danger-text">{entry.error}</span>}</td><td className="py-2 pr-4 font-mono">{entry.num_qubits ?? "—"}q</td><td className="py-2 pr-4 font-mono">{entry.transpiled_depth ?? "—"}</td><td className="py-2 pr-4 font-mono">{entry.two_qubit_gates ?? "—"}</td><td className="py-2 pr-4 font-mono">{entry.swap_count ?? "—"}</td><td className="py-2 pr-4 font-mono">{entry.active_qubits ?? "—"}</td><td className="py-2 pr-4 font-mono">{entry.estimated_duration_us === null ? "—" : `${entry.estimated_duration_us.toFixed(2)} µs`}</td><td className="py-2 pr-4 font-mono">{formatPercent(entry.avg_active_readout_error)}</td><td className="py-2 pr-4 font-mono">{formatPercent(entry.avg_used_edge_error)}</td><td className="py-2 pr-4 font-mono">{entry.pending_jobs ?? "—"}</td><td className="py-2 pr-4">{formatAge(entry.calibration_timestamp)}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="border-t border-line-hairline p-4"><Callout tone="info" title={comparison.recommendation ? `Transparent recommendation: ${comparison.recommendation}` : "No compatible recommendation"}>{comparison.recommendation_reason ?? "No target completed transpilation."} {comparison.recommendation_caveat}</Callout></div>
    </section>
  );
}
