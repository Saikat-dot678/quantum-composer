import { formatEngineName } from "@/lib/formatting";
import type { EnginesResponse } from "@/lib/labTypes";
import {
  Badge,
  Button,
  Callout,
  ErrorState,
  Panel,
  SectionHeader,
  Spinner,
} from "../ui/primitives";

interface EngineAvailabilityPanelProps {
  engines: EnginesResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function EngineAvailabilityPanel({
  engines,
  loading,
  error,
  onRetry,
}: EngineAvailabilityPanelProps) {
  return (
    <Panel className="p-4">
      <SectionHeader
        eyebrow="Runtime inventory"
        title="Engine availability"
        description="Dependency discovery from the active backend. Availability is not a performance guarantee."
      />

      {loading && <Spinner label="Loading engine catalog" />}

      {!loading && error && (
        <ErrorState
          title="Engine catalog unavailable"
          message={error}
          action={<Button size="sm" variant="secondary" onClick={onRetry}>Retry catalog</Button>}
        />
      )}

      {!loading && engines && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-lab-border bg-lab-raised/40 p-3">
              <p className="instrument-label">Qiskit Aer</p>
              <div className="mt-2"><Badge tone={engines.aer_available ? "green" : "red"} dot>{engines.aer_available ? "detected" : "missing"}</Badge></div>
            </div>
            <div className="rounded-lg border border-lab-border bg-lab-raised/40 p-3">
              <p className="instrument-label">Optional Stim</p>
              <div className="mt-2"><Badge tone={engines.stim_available ? "green" : "neutral"} dot>{engines.stim_available ? "detected" : "not installed"}</Badge></div>
            </div>
          </div>

          <div className="space-y-2.5">
            {engines.engines.map((engine) => (
              <article key={engine.id} className="rounded-lg border border-lab-border bg-lab-raised/35 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-xs font-semibold text-lab-text" title={engine.name}>
                      {engine.name || formatEngineName(engine.id)}
                    </h3>
                    <p className="mt-0.5 truncate font-mono text-[9px] text-lab-faint">{engine.id}</p>
                  </div>
                  <Badge tone={engine.available ? "green" : "red"} dot className="shrink-0">
                    {engine.available ? "available" : "unavailable"}
                  </Badge>
                </div>

                <p className="mt-2 text-[11px] leading-4 text-lab-muted">{engine.description}</p>

                <dl className="mt-2 space-y-1.5 border-t border-lab-border pt-2 text-[11px] leading-4">
                  <div>
                    <dt className="inline font-semibold text-lab-text">Best for: </dt>
                    <dd className="inline text-lab-faint">{engine.best_for}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-lab-text">Limits: </dt>
                    <dd className="inline text-lab-faint">{engine.limitations}</dd>
                  </div>
                </dl>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {engine.scales_to_large_structured_circuits && <Badge tone="cyan">structured scale</Badge>}
                  {engine.optional_dependency && <Badge tone="neutral">requires {engine.optional_dependency}</Badge>}
                  {engine.id === "stim_stabilizer" && <Badge tone="neutral">API limit · 4,096q</Badge>}
                </div>

                {engine.id === "stim_stabilizer" && (
                  <p className="mt-2 text-[11px] leading-4 text-lab-faint">The catalog describes the underlying Stim method; this application&apos;s advanced request schema accepts at most 4,096 qubits.</p>
                )}

                {!engine.available && engine.unavailable_reason && (
                  <p className="mt-2 rounded-md border border-accent-red/25 bg-accent-red/[.055] px-2.5 py-2 text-[11px] leading-4 text-red-100/80">
                    {engine.unavailable_reason}
                  </p>
                )}
              </article>
            ))}
          </div>

          <div className="mt-3">
            <Callout tone="info" title="Backend capability note">
              {engines.honesty_note}
            </Callout>
          </div>
        </>
      )}
    </Panel>
  );
}
