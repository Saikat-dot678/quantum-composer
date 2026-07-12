import { PlayIcon } from "@/components/ui/icons";
import { Button, FormField, NumberInput, Panel, Toggle } from "@/components/ui/primitives";
import { getProtocolDefinition, type Protocol } from "./config";
import { ProtocolTabs } from "./ProtocolTabs";

interface Props {
  protocol: Protocol;
  onProtocolChange: (protocol: Protocol) => void;
  numBits: number;
  onNumBitsChange: (value: number) => void;
  eveEnabled: boolean;
  onEveChange: (value: boolean) => void;
  channelError: number;
  onChannelErrorChange: (value: number) => void;
  seed: number | "";
  onSeedChange: (value: number | "") => void;
  busy: boolean;
  onRun: () => void;
}

function RangeField({ id, label, valueLabel, value, min, max, step, onChange }: { id: string; label: string; valueLabel: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <FormField htmlFor={id} label={<span className="flex items-center justify-between gap-2"><span>{label}</span><b className="font-mono text-lab-text">{valueLabel}</b></span>}>
      <input id={id} type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-cyan-400" />
      <div className="mt-1 flex justify-between font-mono text-[10px] text-lab-faint"><span>{min}</span><span>{max}</span></div>
    </FormField>
  );
}

export function ProtocolControlPanel(props: Props) {
  const definition = getProtocolDefinition(props.protocol);
  const maxBits = props.protocol === "qrng" ? 8192 : 4096;
  return (
    <aside className="space-y-4">
      <Panel className="p-4">
        <p className="instrument-label mb-3">Protocol family</p>
        <ProtocolTabs protocol={props.protocol} onChange={props.onProtocolChange} />
        <div className="mt-4 border-t border-lab-border pt-4">
          <p className="text-sm font-semibold text-lab-text">{definition.name}</p>
          <p className="mt-1 text-xs leading-5 text-lab-muted">{definition.summary}</p>
        </div>
      </Panel>

      <Panel className="p-4">
        <p className="instrument-label mb-4">Run parameters</p>
        <div className="space-y-4">
          <RangeField id="crypto-samples" label={props.protocol === "e91" ? "Entangled pairs" : "Sample bits"} valueLabel={props.numBits.toLocaleString()} value={props.numBits} min={16} max={maxBits} step={16} onChange={props.onNumBitsChange} />
          {props.protocol !== "qrng" && (
            <RangeField id="crypto-channel-error" label="Channel error rate" valueLabel={`${(props.channelError * 100).toFixed(0)}%`} value={props.channelError} min={0} max={0.5} step={0.01} onChange={props.onChannelErrorChange} />
          )}
          {(props.protocol === "bb84" || props.protocol === "e91") && (
            <Toggle checked={props.eveEnabled} onChange={props.onEveChange} label="Enable Eve model" description="Insert an educational intercept-resend disturbance model." />
          )}
          <NumberInput
            id="crypto-seed"
            label="Seed"
            hint={props.seed === "" ? "Unset seeds vary between runs." : "The same explicit seed reproduces this protocol sample."}
            min={0}
            step={1}
            placeholder="random"
            value={props.seed}
            onChange={(event) => props.onSeedChange(event.target.value === "" ? "" : Math.max(0, Math.trunc(Number(event.target.value))))}
          />
          <Button variant="primary" className="w-full" loading={props.busy} onClick={props.onRun}>
            {!props.busy && <PlayIcon className="h-4 w-4" />}{props.busy ? "Running protocol" : `Run ${definition.name}`}
          </Button>
        </div>
      </Panel>
    </aside>
  );
}
