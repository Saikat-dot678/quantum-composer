import { AlertIcon, CheckIcon, FlaskIcon, ShieldIcon } from "@/components/ui/icons";
import { getProtocolDefinition, type Protocol } from "./config";
import styles from "./cryptoLab.module.css";

interface ProtocolFlowProps {
  protocol: Protocol;
  eveEnabled: boolean;
  channelError: number;
  numBits: number;
  busy: boolean;
  hasResult: boolean;
  stale: boolean;
}

interface FlowStep {
  label: string;
  detail: string;
  alert?: boolean;
  final?: boolean;
}

function flowSteps({ protocol, eveEnabled, channelError, numBits, hasResult, stale }: ProtocolFlowProps): FlowStep[] {
  const definition = getProtocolDefinition(protocol);
  const count = `${numBits.toLocaleString()} ${protocol === "e91" ? "pairs" : "bits"}`;
  const noise = `${(channelError * 100).toFixed(channelError < 0.01 ? 1 : 0)}% modeled error`;
  const steps: FlowStep[] = definition.steps.map((label, index) => ({
    label,
    detail: index === 0 ? count : index === 1 && protocol !== "qrng" ? noise : index === definition.steps.length - 1 ? (hasResult ? (stale ? "result needs refresh" : "current observation") : "awaiting observation") : "protocol operation",
    final: index === definition.steps.length - 1,
  }));

  if (eveEnabled && (protocol === "bb84" || protocol === "e91")) {
    steps.splice(2, 0, {
      label: protocol === "bb84" ? "Eve intercepts + resends" : "Eve collapses pair model",
      detail: "disturbance model enabled",
      alert: true,
    });
  }
  return steps;
}

export function ProtocolFlow(props: ProtocolFlowProps) {
  const definition = getProtocolDefinition(props.protocol);
  const steps = flowSteps(props);

  return (
    <div className="overflow-x-auto pb-2 [scrollbar-width:thin]">
      <ol className="flex min-w-max items-center" aria-label={`${definition.name} signal path`}>
        {steps.map((step, index) => {
          const Icon = step.alert ? AlertIcon : step.final ? CheckIcon : index === 0 ? FlaskIcon : ShieldIcon;
          return (
            <li key={`${step.label}-${index}`} className="flex items-center">
              <div className={`relative flex min-h-[72px] w-[148px] flex-col justify-between overflow-hidden rounded-lg border px-3 py-2.5 ${step.alert ? "border-accent-red/45 bg-accent-red/[.08]" : step.final && props.hasResult && !props.stale ? "border-accent-green/35 bg-accent-green/[.055]" : "border-lab-borderStrong/80 bg-lab-panel/75"} ${props.busy ? styles.busyScan : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] uppercase tracking-[.16em] text-lab-faint">stage {String(index + 1).padStart(2, "0")}</span>
                  <Icon className={`h-3.5 w-3.5 ${step.alert ? "text-accent-red" : step.final && props.hasResult && !props.stale ? "text-accent-green" : "text-accent-cyan"}`} />
                </div>
                <div>
                  <p className={`text-[11px] font-semibold leading-4 ${step.alert ? "text-red-100" : "text-lab-text"}`}>{step.label}</p>
                  <p className="mt-0.5 font-mono text-[9px] leading-3 text-lab-faint">{step.detail}</p>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className="mx-2 w-8 sm:w-12" aria-hidden="true">
                  <div className={`${styles.signalTrack} ${step.alert ? styles.signalTrackAlert : ""}`} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
