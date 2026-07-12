"use client";

import { useState } from "react";
import { formatEngineName, formatInteger } from "@/lib/formatting";
import type { SimulationV2Response } from "@/lib/labTypes";
import { AlertIcon, PlayIcon, RefreshIcon } from "@/components/ui/icons";
import { HistogramPanel } from "../ui/HistogramPanel";
import { Badge, Button, CopyButton } from "../ui/primitives";

interface SimulationResultPanelProps {
  result: SimulationV2Response | null;
  loading: boolean;
  error: string | null;
  elapsedMs?: number;
  onRetry: () => void;
}

type ResultView = "distribution" | "diagnostics" | "diagram";

function phaseForElapsed(elapsedMs: number): string {
  if (elapsedMs < 900) return "Validating request and routing the circuit";
  if (elapsedMs < 2500) return "Preparing the selected classical engine";
  return "Executing samples; structured MPS or high-shot work may take longer";
}

function summarizeSamples(counts: Record<string, number>): { shots: number; outcomes: number } {
  let shots = 0;
  let outcomes = 0;
  for (const key in counts) {
    if (!Object.prototype.hasOwnProperty.call(counts, key)) continue;
    shots += counts[key];
    outcomes += 1;
  }
  return { shots, outcomes };
}

function DockHeader({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-lab-border bg-lab-panel px-4 py-2 sm:px-5">{children}</div>;
}

export function SimulationResultPanel({ result, loading, error, elapsedMs = 0, onRetry }: SimulationResultPanelProps) {
  const [view, setView] = useState<ResultView>("distribution");

  if (loading) {
    return (
      <section aria-labelledby="result-dock-heading" className="h-full min-h-[17rem] border-t border-lab-borderStrong bg-lab-surface">
        <DockHeader>
          <div>
            <p className="instrument-label text-accent-amber">Execution dock</p>
            <h2 id="result-dock-heading" className="mt-0.5 text-xs font-semibold text-lab-text">Classical simulation in progress</h2>
          </div>
          <Badge tone="amber" dot><span className="font-mono">{(elapsedMs / 1000).toFixed(1)} s elapsed</span></Badge>
        </DockHeader>
        <div className="flex h-[calc(100%-3rem)] min-h-[13rem] flex-col items-center justify-center px-5 py-8 text-center" role="status" aria-live="polite">
          <span className="relative h-12 w-12" aria-hidden="true">
            <span className="absolute inset-0 rounded-full border border-accent-cyan/25" />
            <span className="absolute inset-1 animate-spin rounded-full border-2 border-lab-borderStrong border-t-accent-cyan" />
            <span className="absolute inset-[19px] rounded-full bg-accent-cyan shadow-glow" />
          </span>
          <p className="mt-4 text-sm font-semibold text-lab-text">{phaseForElapsed(elapsedMs)}</p>
          <p className="mt-1 max-w-xl text-[11px] leading-5 text-lab-muted">
            The backend endpoint is synchronous and does not report a trustworthy percentage. Options stay locked to prevent overlapping resource-heavy runs.
          </p>
          <div className="mt-5 h-1 w-full max-w-md overflow-hidden rounded-full bg-lab-raised" aria-hidden="true">
            <span className="block h-full w-1/3 animate-pulse rounded-full bg-gradient-to-r from-transparent via-accent-cyan to-transparent" />
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section aria-labelledby="result-dock-heading" className="h-full min-h-[17rem] border-t border-accent-red/35 bg-accent-red/[.025]">
        <DockHeader>
          <div>
            <p className="instrument-label text-accent-red">Execution dock</p>
            <h2 id="result-dock-heading" className="mt-0.5 text-xs font-semibold text-red-100">Run rejected or failed</h2>
          </div>
          <Button size="sm" variant="secondary" onClick={onRetry}><RefreshIcon className="h-3.5 w-3.5" /> Retry current setup</Button>
        </DockHeader>
        <div className="flex min-h-[13rem] items-start gap-3 px-4 py-5 sm:px-5" role="alert">
          <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent-red" />
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-red-100">The backend did not produce a result</p>
            <p className="mt-2 text-xs leading-5 text-red-100/75">{error}</p>
            <p className="mt-3 text-[10px] leading-4 text-lab-faint">Review the selected lane&apos;s rejection reason, memory budget, noise setting, and approximation policy before retrying.</p>
          </div>
        </div>
      </section>
    );
  }

  if (!result) {
    return (
      <section aria-labelledby="result-dock-heading" className="h-full min-h-[17rem] border-t border-lab-borderStrong bg-lab-surface">
        <DockHeader>
          <div>
            <p className="instrument-label">Execution dock</p>
            <h2 id="result-dock-heading" className="mt-0.5 text-xs font-semibold text-lab-text">No run for the current setup</h2>
          </div>
          <Button size="sm" variant="primary" onClick={onRetry}><PlayIcon className="h-3.5 w-3.5" /> Run simulation</Button>
        </DockHeader>
        <div className="grid min-h-[13rem] place-items-center px-5 py-8 text-center">
          <div>
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-full border border-dashed border-lab-borderStrong font-mono text-xs text-lab-faint">▶</div>
            <p className="mt-3 text-sm font-semibold text-lab-text">Analysis is ready; execution is deliberate</p>
            <p className="mx-auto mt-1 max-w-lg text-[11px] leading-5 text-lab-muted">Select an engine lane, inspect its reason, then run. Results, timing, warnings, and router diagnostics stay docked here.</p>
          </div>
        </div>
      </section>
    );
  }

  const sampleSummary = summarizeSamples(result.counts);
  const metadataText = JSON.stringify(result.metadata, null, 2);
  const autoSelected = result.metadata.auto_selected === true;
  const approximate = result.metadata.approximate === true;
  const requestedEngine = typeof result.metadata.requested_engine === "string" ? result.metadata.requested_engine : null;
  const views: Array<{ id: ResultView; label: string }> = [
    { id: "distribution", label: "Distribution" },
    { id: "diagnostics", label: "Diagnostics" },
    { id: "diagram", label: "Diagram" },
  ];

  return (
    <section aria-labelledby="result-dock-heading" className="h-full min-h-[17rem] border-t border-lab-borderStrong bg-lab-surface">
      <DockHeader>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <div>
            <p className="instrument-label text-accent-green">Execution dock</p>
            <h2 id="result-dock-heading" className="mt-0.5 text-xs font-semibold text-lab-text">{formatEngineName(result.selected_engine)} completed</h2>
          </div>
          <div className="hidden h-6 w-px bg-lab-border sm:block" aria-hidden="true" />
          <span className="font-mono text-[10px] text-lab-muted">{formatInteger(sampleSummary.shots)} shots</span>
          <span className="font-mono text-[10px] text-lab-muted">{formatInteger(sampleSummary.outcomes)} outcomes</span>
          <span className="font-mono text-[10px] font-semibold text-accent-cyan">{result.timing_ms.toFixed(1)} ms engine time</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={autoSelected ? "cyan" : "neutral"}>{autoSelected ? "auto-selected" : "manual route"}</Badge>
          {approximate && <Badge tone="amber">MPS may approximate</Badge>}
        </div>
      </DockHeader>

      <div className="flex min-h-10 items-center gap-1 overflow-x-auto border-b border-lab-border bg-lab-bg/45 px-4 sm:px-5" aria-label="Result dock view">
        {views.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={view === item.id}
            onClick={() => setView(item.id)}
            className={`min-h-8 shrink-0 border-b-2 px-3 text-[11px] font-semibold transition ${view === item.id ? "border-accent-cyan text-accent-cyan" : "border-transparent text-lab-faint hover:text-lab-muted"}`}
          >
            {item.label}
          </button>
        ))}
        <span className="ml-auto shrink-0 text-[9px] text-lab-faint">Transport and analysis excluded from timing</span>
      </div>

      <div className="max-h-[calc(40vh-5.5rem)] min-h-[12rem] overflow-y-auto px-4 py-4 sm:px-5">
        {view === "distribution" && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(15rem,.45fr)]">
            <div className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="instrument-label">Measurement distribution</p>
                  <p className="mt-1 text-[10px] text-lab-faint">Most frequent outcomes; all counts remain available in the response.</p>
                </div>
                <Badge tone="neutral">top outcomes</Badge>
              </div>
              <HistogramPanel counts={result.counts} />
            </div>
            <div className="border-l border-lab-border pl-4">
              <p className="instrument-label">Router decision</p>
              <p className="mt-2 text-[11px] leading-5 text-lab-muted">{result.engine_reason}</p>
              {requestedEngine && requestedEngine !== result.selected_engine && <p className="mt-2 font-mono text-[10px] text-lab-faint">requested {requestedEngine} → selected {result.selected_engine}</p>}
              {result.warnings.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-lab-border pt-3 text-[10px] leading-4 text-accent-amber">
                  {result.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
                </ul>
              )}
            </div>
          </div>
        )}

        {view === "diagnostics" && (
          <div className="grid gap-5 lg:grid-cols-[minmax(16rem,.7fr)_minmax(0,1.3fr)]">
            <div>
              <p className="instrument-label">Run resource estimate</p>
              <dl className="mt-2 divide-y divide-lab-border border-y border-lab-border text-[11px]">
                <div className="flex justify-between gap-3 py-2"><dt className="text-lab-faint">Configured budget</dt><dd className="font-mono font-semibold text-accent-cyan">{formatInteger(result.resource_estimate.max_memory_mb)} MB</dd></div>
                <div className="flex justify-between gap-3 py-2"><dt className="text-lab-faint">Statevector</dt><dd className="text-right font-mono text-lab-text">{result.resource_estimate.statevector_memory_human}</dd></div>
                <div className="flex justify-between gap-3 py-2"><dt className="text-lab-faint">Density matrix</dt><dd className="text-right font-mono text-lab-text">{result.resource_estimate.density_matrix_memory_human}</dd></div>
                <div className="flex justify-between gap-3 py-2"><dt className="text-lab-faint">Risk label</dt><dd className="font-mono text-lab-text">{result.resource_estimate.risk_label}</dd></div>
                <div className="flex justify-between gap-3 py-2"><dt className="text-lab-faint">Circuit depth</dt><dd className="font-mono text-lab-text">{formatInteger(result.depth)}</dd></div>
              </dl>
              {result.resource_estimate.notes.length > 0 && <ul className="mt-3 space-y-1 text-[10px] leading-4 text-lab-faint">{result.resource_estimate.notes.map((note) => <li key={note}>• {note}</li>)}</ul>}
            </div>
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="instrument-label">Router and engine metadata</p>
                <CopyButton text={metadataText} label="Copy metadata" />
              </div>
              <pre className="mt-2 max-h-56 overflow-auto border border-lab-border bg-lab-bg p-3 font-mono text-[10px] leading-4 text-lab-muted">{metadataText}</pre>
            </div>
          </div>
        )}

        {view === "diagram" && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="instrument-label">Backend text diagram</p>
                <p className="mt-1 text-[10px] text-lab-faint">Generated only for circuits up to 12 qubits and 80 operations.</p>
              </div>
              <Badge tone={result.diagram ? "green" : "neutral"}>{result.diagram ? "available" : "omitted at scale"}</Badge>
            </div>
            {result.diagram ? (
              <pre className="mt-3 max-h-64 overflow-auto border border-lab-border bg-lab-bg p-3 font-mono text-[10px] leading-4 text-slate-300">{result.diagram}</pre>
            ) : (
              <div className="mt-3 border border-dashed border-lab-borderStrong px-4 py-8 text-center">
                <p className="text-xs font-semibold text-lab-muted">Diagram deliberately omitted</p>
                <p className="mx-auto mt-1 max-w-lg text-[10px] leading-4 text-lab-faint">Rendering a large text circuit would add noise and payload cost. The circuit fingerprint, gate profile, and engine diagnostics remain available.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
