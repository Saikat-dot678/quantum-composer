import { Play, RefreshCw } from "lucide-react";
import { Badge, Button, FormField, NumberInput, Panel, Toggle } from "@/components/ui/primitives";
import { getProtocolDefinition, type Protocol } from "./config";

interface Props {
  protocol: Protocol;
  numBits: number;
  onNumBitsChange: (value: number) => void;
  eveEnabled: boolean;
  onEveChange: (value: boolean) => void;
  channelError: number;
  onChannelErrorChange: (value: number) => void;
  seed: number | "";
  onSeedChange: (value: number | "") => void;
  busy: boolean;
  stale: boolean;
  hasResult: boolean;
  onRun: () => void;
}

function RangeField({ id, label, valueLabel, value, min, max, step, onChange }: { id: string; label: string; valueLabel: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <FormField htmlFor={id} label={<span className="flex items-center justify-between gap-3"><span>{label}</span><b className="font-mono text-lab-text">{valueLabel}</b></span>}>
      <input
        id={id}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-7 w-full cursor-pointer accent-cyan-400 disabled:cursor-not-allowed"
      />
      <div className="flex justify-between font-mono text-[9px] text-lab-faint"><span>{min.toLocaleString()}</span><span>{max.toLocaleString()}</span></div>
    </FormField>
  );
}

export function ProtocolControlPanel(props: Props) {
  const definition = getProtocolDefinition(props.protocol);
  const maxBits = props.protocol === "qrng" ? 8192 : 4096;
  const samplePresets = props.protocol === "qrng" ? [128, 1024, 8192] : [128, 512, 2048];

  return (
    <Panel className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-lab-border px-4 py-3.5">
        <div>
          <p className="instrument-label">Experiment controls</p>
          <h2 className="mt-1 font-display text-sm font-semibold text-lab-text">Configure {definition.name}</h2>
        </div>
        <Badge tone={props.stale ? "amber" : props.hasResult ? "green" : "neutral"} dot>
          {props.stale ? "stale" : props.hasResult ? "current" : "not run"}
        </Badge>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-1">
        <div>
          <RangeField
            id="crypto-samples"
            label={props.protocol === "e91" ? "Entangled pairs" : "Sample bits"}
            valueLabel={props.numBits.toLocaleString()}
            value={props.numBits}
            min={16}
            max={maxBits}
            step={16}
            onChange={props.onNumBitsChange}
          />
          <div className="mt-1.5 flex gap-1.5" aria-label="Sample-size presets">
            {samplePresets.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => props.onNumBitsChange(value)}
                aria-pressed={props.numBits === value}
                className={`min-h-7 flex-1 rounded-md border px-1.5 font-mono text-[9px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan ${props.numBits === value ? "border-accent-cyan/50 bg-accent-cyan/10 text-accent-cyan" : "border-lab-border bg-lab-raised/45 text-lab-faint hover:text-lab-muted"}`}
              >
                {value.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {props.protocol !== "qrng" ? (
          <RangeField
            id="crypto-channel-error"
            label="Channel error"
            valueLabel={`${(props.channelError * 100).toFixed(props.channelError < 0.01 ? 1 : 0)}%`}
            value={props.channelError}
            min={0}
            max={0.5}
            step={0.01}
            onChange={props.onChannelErrorChange}
          />
        ) : (
          <div className="rounded-lg border border-lab-border bg-lab-raised/35 px-3 py-2.5 text-[11px] leading-4 text-lab-muted">
            The model samples an ideal 50/50 measurement. A fixed seed makes the pseudo-random sample reproducible.
          </div>
        )}

        {(props.protocol === "bb84" || props.protocol === "e91") && (
          <Toggle
            checked={props.eveEnabled}
            onChange={props.onEveChange}
            label="Insert Eve disturbance"
            description={props.protocol === "bb84" ? "Intercept, measure in a random basis, and resend." : "Replace entanglement with an intercept–resend product-state model."}
          />
        )}

        <details className="group rounded-lg border border-lab-border bg-lab-raised/30 px-3 py-2.5 sm:col-span-2 xl:col-span-1">
          <summary className="cursor-pointer list-none text-xs font-semibold text-lab-muted outline-none marker:hidden focus-visible:text-accent-cyan">
            <span className="flex items-center justify-between">Reproducibility <span className="text-lab-faint transition-transform group-open:rotate-180" aria-hidden="true">⌄</span></span>
          </summary>
          <div className="mt-3">
            <NumberInput
              id="crypto-seed"
              label="Deterministic seed"
              hint={props.seed === "" ? "No fixed seed: the next sample may differ." : "Repeat this seed and configuration to reproduce the sample."}
              min={0}
              max={Number.MAX_SAFE_INTEGER}
              step={1}
              placeholder="random"
              value={props.seed}
              onChange={(event) => props.onSeedChange(event.target.value === "" ? "" : Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(Number(event.target.value)) || 0)))}
            />
          </div>
        </details>
      </div>

      <div className="border-t border-lab-border bg-lab-surface/55 p-3">
        <Button variant="primary" className="w-full" loading={props.busy} onClick={props.onRun}>
          {!props.busy && (props.stale ? <RefreshCw className="h-4 w-4" /> : <Play className="h-4 w-4" />)}
          {props.busy ? `Running ${definition.name}` : props.stale ? `Refresh ${definition.name}` : `Run ${definition.name}`}
        </Button>
        <p className="mt-2 text-center text-[9px] leading-3 text-lab-faint">Backend protocol model · no executable URL or user code</p>
      </div>
    </Panel>
  );
}
