import { AlertIcon, CheckIcon, ChevronIcon, ShieldIcon } from "@/components/ui/icons";
import { getProtocolDefinition, type Protocol } from "./config";

export function ProtocolFlow({ protocol, eveEnabled }: { protocol: Protocol; eveEnabled: boolean }) {
  const definition = getProtocolDefinition(protocol);
  const steps = eveEnabled && (protocol === "bb84" || protocol === "e91")
    ? [...definition.steps.slice(0, 2), "Eve intercepts", ...definition.steps.slice(2)]
    : definition.steps;

  return (
    <div className="overflow-x-auto pb-1">
      <ol className="flex min-w-max items-stretch" aria-label={`${definition.name} protocol flow`}>
        {steps.map((step, index) => {
          const eveStep = step.startsWith("Eve");
          const finalStep = index === steps.length - 1;
          const Icon = eveStep ? AlertIcon : finalStep ? CheckIcon : ShieldIcon;
          return (
            <li key={`${step}-${index}`} className="flex items-center">
              <div className={`flex min-h-[74px] w-40 flex-col justify-between rounded-lg border p-3 ${eveStep ? "border-accent-red/45 bg-accent-red/[.07]" : "border-lab-border bg-lab-raised/45"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-lab-faint">{String(index + 1).padStart(2, "0")}</span>
                  <Icon className={`h-4 w-4 ${eveStep ? "text-accent-red" : "text-accent-cyan"}`} />
                </div>
                <span className={`text-xs font-semibold ${eveStep ? "text-red-100" : "text-lab-text"}`}>{step}</span>
              </div>
              {!finalStep && <ChevronIcon className="mx-2 h-4 w-4 shrink-0 text-lab-faint" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
