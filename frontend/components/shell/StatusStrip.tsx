import { ActivityIcon, CircuitIcon, FlaskIcon, ServerIcon, ShieldIcon } from "@/components/ui/icons";
import type { LocalFeasibility } from "@/lib/feasibility";
import type { Mode } from "./ModeTabs";
import { MODE_LABELS } from "./ModeTabs";

export type BackendStatus = "checking" | "online" | "offline";

const STATUS_COPY: Record<BackendStatus, { label: string; className: string }> = {
  checking: { label: "Checking", className: "text-accent-amber" },
  online: { label: "Online", className: "text-accent-green" },
  offline: { label: "Offline", className: "text-accent-red" },
};

const RISK_CLASS: Record<string, string> = {
  safe: "text-accent-green",
  heavy: "text-accent-amber",
  dangerous: "text-accent-amber",
  infeasible: "text-accent-red",
};

function Segment({ icon, label, value, valueClass = "text-lab-text", title }: { icon: React.ReactNode; label: string; value: string; valueClass?: string; title?: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-r border-lab-border px-3 py-2 last:border-r-0 sm:px-4" title={title}>
      <span className="text-lab-faint" aria-hidden="true">{icon}</span>
      <span>
        <span className="block font-display text-[9px] font-semibold uppercase tracking-[.16em] text-lab-faint">{label}</span>
        <span className={`block whitespace-nowrap font-mono text-[11px] font-semibold ${valueClass}`}>{value}</span>
      </span>
    </div>
  );
}

// The strip is live telemetry, not static branding: circuit shape, routing, and
// instant local feasibility update as the user edits in any mode.
export function StatusStrip({
  mode,
  backendStatus,
  feasibility,
}: {
  mode: Mode;
  backendStatus: BackendStatus;
  feasibility: LocalFeasibility | null;
}) {
  const backend = STATUS_COPY[backendStatus];
  return (
    <div className="overflow-x-auto border-t border-lab-border bg-[#080d13] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Application status">
      <div className="mx-auto flex w-max min-w-full max-w-[1800px] items-stretch lg:px-4">
        <Segment icon={<ServerIcon className="h-3.5 w-3.5" />} label="Backend" value={backend.label} valueClass={backend.className} />
        <Segment icon={<CircuitIcon className="h-3.5 w-3.5" />} label="Active mode" value={MODE_LABELS[mode]} />
        {feasibility && (
          <>
            <Segment
              icon={<ActivityIcon className="h-3.5 w-3.5" />}
              label="Circuit"
              value={`${feasibility.numQubits}q · ${feasibility.operationCount} ops · ${feasibility.isClifford ? "Clifford" : "non-Clifford"}`}
              title={feasibility.isClifford ? "All gates are Clifford; stabilizer methods apply." : `T-count ${feasibility.tCount}, rotations ${feasibility.rotationCount}.`}
            />
            <Segment
              icon={<FlaskIcon className="h-3.5 w-3.5" />}
              label="Route / exact memory"
              value={`${feasibility.route.id.toUpperCase()} · ${feasibility.statevectorHuman} · ${feasibility.risk}`}
              valueClass={RISK_CLASS[feasibility.risk] ?? "text-lab-text"}
              title={`Instant local estimate at 16·2^n bytes against the ${feasibility.route.label}. The backend estimator remains authoritative at run time.`}
            />
          </>
        )}
        <Segment icon={<ShieldIcon className="h-3.5 w-3.5" />} label="Simulation policy" value="Structured large circuits only" valueClass="text-accent-cyan" />
      </div>
    </div>
  );
}
