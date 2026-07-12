import { AlertIcon, InfoIcon, ShieldIcon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/primitives";
import { getProtocolDefinition, type Protocol } from "./config";

export function ProtocolBrief({ protocol, hasResult, stale, seed }: { protocol: Protocol; hasResult: boolean; stale: boolean; seed: number | "" }) {
  const definition = getProtocolDefinition(protocol);
  return (
    <Panel as="aside" className="overflow-hidden">
      <details className="group" open>
        <summary className="cursor-pointer list-none border-b border-lab-border px-4 py-3 outline-none focus-visible:bg-accent-cyan/[.04]">
          <span className="flex items-center justify-between gap-3">
            <span>
              <span className="instrument-label block">Interpretation guide</span>
              <span className="mt-0.5 block text-xs font-semibold text-lab-text">What {definition.name} can show</span>
            </span>
            <span className="text-lab-faint transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
          </span>
        </summary>
        <div className="space-y-3 p-4 text-[11px] leading-4 text-lab-muted">
          <div className="flex gap-2.5"><InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-cyan" /><p>{definition.teaches}</p></div>
          <div className="flex gap-2.5"><AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-amber" /><p>{definition.securityNote}</p></div>
          <div className="flex gap-2.5"><ShieldIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-quantum-400" /><p>{seed === "" ? "No seed is fixed; repeated runs can differ." : `Seed ${seed.toLocaleString()} is fixed for reproducibility.`}</p></div>
          {hasResult && <p className={`rounded-md border px-2.5 py-2 font-medium ${stale ? "border-accent-amber/30 bg-accent-amber/[.055] text-amber-100" : "border-accent-green/25 bg-accent-green/[.045] text-emerald-100"}`}>{stale ? "Controls changed after the visible run. Refresh before comparing values." : "The visible result matches the current controls."}</p>}
        </div>
      </details>
      <div className="border-t border-lab-border bg-lab-surface/45 px-4 py-3 text-[10px] leading-4 text-lab-faint">
        Educational software model only. No physical source, detector, authenticated channel, secure key, or entropy source is certified.
      </div>
    </Panel>
  );
}
