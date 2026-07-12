import { BasisComparisonTable } from "@/components/ui/BasisComparisonTable";
import { BitStringViewer } from "@/components/ui/BitStringViewer";
import { QBERMeter } from "@/components/ui/QBERMeter";
import { Badge, Callout, Panel, SectionHeader, StatTile } from "@/components/ui/primitives";
import { formatPercent, joinBits } from "@/lib/formatting";
import type { BB84Result } from "@/lib/labTypes";

function Sequence({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="instrument-label">{label}</p>
      <p className="mt-1 overflow-x-auto whitespace-nowrap rounded-md bg-lab-surface px-2.5 py-2 font-mono text-[11px] text-lab-muted">{value || "—"}</p>
    </div>
  );
}

function ActorCard({ name, tone, children }: { name: string; tone: "cyan" | "red" | "green"; children: React.ReactNode }) {
  const toneClass = tone === "red" ? "border-accent-red/35" : tone === "green" ? "border-accent-green/35" : "border-accent-cyan/35";
  return (
    <article className={`rounded-lg border bg-lab-raised/35 p-3 ${toneClass}`}>
      <p className="mb-3 text-xs font-semibold text-lab-text">{name}</p>
      <div className="space-y-2.5">{children}</div>
    </article>
  );
}

export function BB84Panel({ result }: { result: BB84Result }) {
  const discarded = result.alice_bases.map((basis, index) => basis !== result.bob_bases[index] ? index : -1).filter((index) => index >= 0);
  const threshold = result.charts_data.qber_threshold;
  const disturbed = result.qber > threshold;
  return (
    <Panel className="p-4 sm:p-5">
      <SectionHeader
        eyebrow="BB84 · prepare and measure"
        title="Basis reconciliation and key material"
        description="Inspect what each party prepared or measured, then trace which positions survive basis sifting."
        right={<Badge tone={disturbed ? "red" : "green"} dot>{disturbed ? "Elevated disturbance" : "QBER below model threshold"}</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Transmitted" value={result.num_bits} />
        <StatTile label="Basis matches" value={result.charts_data.basis_match_count} tone="cyan" />
        <StatTile label="Sifted errors" value={result.charts_data.sifted_error_count} tone={result.charts_data.sifted_error_count ? "amber" : "green"} />
        <StatTile label="Final key" value={result.final_key_length} tone="violet" hint="simplified privacy amplification" />
      </div>

      <div className="mt-4 rounded-lg border border-lab-border bg-lab-surface/45 p-4">
        <QBERMeter qber={result.qber} threshold={threshold} />
        <p className="mt-3 text-xs leading-5 text-lab-muted">
          Channel error input: <b className="font-mono text-lab-text">{formatPercent(result.channel_error_rate)}</b>. The {formatPercent(threshold, 0)} line is the simplified educational threshold used by this model; channel noise can also raise QBER.
        </p>
      </div>

      <div className={`mt-4 grid gap-3 ${result.eve_enabled ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}>
        <ActorCard name="Alice · sender" tone="cyan">
          <Sequence label="Bits · first 48" value={joinBits(result.alice_bits.slice(0, 48))} />
          <Sequence label="Bases · first 48" value={result.alice_bases.slice(0, 48).join(" ")} />
        </ActorCard>
        {result.eve_enabled && (
          <ActorCard name="Eve · intercept-resend" tone="red">
            <Sequence label="Guessed bases · first 48" value={result.eve_bases.slice(0, 48).join(" ")} />
            <p className="text-[11px] leading-4 text-red-100/70">Wrong-basis measurements disturb the state before it reaches Bob.</p>
          </ActorCard>
        )}
        <ActorCard name="Bob · receiver" tone="green">
          <Sequence label="Bases · first 48" value={result.bob_bases.slice(0, 48).join(" ")} />
          <Sequence label="Measurements · first 48" value={joinBits(result.bob_measurements.slice(0, 48))} />
        </ActorCard>
      </div>

      <div className="mt-5">
        <p className="instrument-label mb-2">Transmission comparison</p>
        <BasisComparisonTable aliceBases={result.alice_bases} bobBases={result.bob_bases} aliceBits={result.alice_bits} bobMeasurements={result.bob_measurements} limit={40} />
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        <BitStringViewer bits={result.sifted_key_alice} label="Alice sifted key" limit={128} />
        <BitStringViewer bits={result.sifted_key_bob} label="Bob sifted key" limit={128} />
        <BitStringViewer bits={result.privacy_amplification.final_key} label="Amplified key · Alice model" limit={128} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-lab-border bg-lab-raised/35 p-3">
          <p className="instrument-label">Discarded transmission positions · sample</p>
          <p className="mt-2 break-words font-mono text-xs leading-5 text-lab-muted">{discarded.slice(0, 64).join(", ") || "None"}{discarded.length > 64 ? ` … +${discarded.length - 64}` : ""}</p>
        </div>
        <div className="rounded-lg border border-lab-border bg-lab-raised/35 p-3">
          <p className="instrument-label">Sifted-key error positions · sample</p>
          <p className="mt-2 break-words font-mono text-xs leading-5 text-lab-muted">{result.charts_data.error_positions.join(", ") || "None in this run"}</p>
        </div>
      </div>

      <div className="mt-4">
        <Callout tone={disturbed ? "warning" : "info"} title="Interpretation">{result.explanation} This finite educational run does not authenticate a physical channel or provide a deployable shared key.</Callout>
      </div>
    </Panel>
  );
}
