import { Badge, Callout, Panel, SectionHeader } from "@/components/ui/primitives";
import { getProtocolDefinition, type Protocol } from "./config";

export function ProtocolBrief({ protocol, hasResult, stale, seed }: { protocol: Protocol; hasResult: boolean; stale: boolean; seed: number | "" }) {
  const definition = getProtocolDefinition(protocol);
  return (
    <aside className="space-y-4 xl:col-span-2 2xl:col-span-1">
      <Panel className="p-4 2xl:sticky 2xl:top-36">
        <SectionHeader eyebrow="Protocol brief" title={definition.name} right={hasResult ? <Badge tone={stale ? "amber" : "green"} dot>{stale ? "Parameters changed" : "Current run"}</Badge> : <Badge>Awaiting run</Badge>} />
        <div className="space-y-4">
          <div><p className="instrument-label">What this teaches</p><p className="mt-1.5 text-xs leading-5 text-lab-muted">{definition.teaches}</p></div>
          <div><p className="instrument-label">Interpretation boundary</p><p className="mt-1.5 text-xs leading-5 text-lab-muted">{definition.securityNote}</p></div>
          <div><p className="instrument-label">Randomness source</p><p className="mt-1.5 text-xs leading-5 text-lab-muted">{seed === "" ? "No seed is fixed; repeated runs may differ." : `Seed ${seed} is fixed for reproducibility.`}</p></div>
          {stale && <Callout tone="warning">The visible result belongs to an earlier parameter snapshot. Run the protocol again before interpreting it.</Callout>}
        </div>
      </Panel>
      <Panel className="p-4">
        <p className="instrument-label">Trust boundary</p>
        <ul className="mt-3 space-y-2 text-xs leading-5 text-lab-muted">
          <li>• Protocol-level statistics, not a production QKD deployment.</li>
          <li>• An authenticated classical channel is still required.</li>
          <li>• No physical source, detector, or hardware entropy is certified.</li>
          <li>• No user-submitted Python is executed.</li>
        </ul>
      </Panel>
    </aside>
  );
}
