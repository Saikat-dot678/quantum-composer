import { Button } from "@/components/ui/primitives";
import { CircuitIcon, FlaskIcon, ShieldIcon } from "@/components/ui/icons";

export type Mode = "composer" | "simulator" | "crypto";

export const MODE_LABELS: Record<Mode, string> = {
  composer: "Composer",
  simulator: "Simulator Lab",
  crypto: "Cryptography Lab",
};

const TABS = [
  { id: "composer" as const, label: MODE_LABELS.composer, Icon: CircuitIcon },
  { id: "simulator" as const, label: MODE_LABELS.simulator, Icon: FlaskIcon },
  { id: "crypto" as const, label: MODE_LABELS.crypto, Icon: ShieldIcon },
];

export function ModeTabs({ mode, onModeChange }: { mode: Mode; onModeChange: (mode: Mode) => void }) {
  return (
    <nav aria-label="Application modes" className="min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex w-max min-w-full items-center gap-1 rounded-lg border border-lab-border bg-lab-surface/80 p-1 sm:min-w-0">
        {TABS.map(({ id, label, Icon }) => {
          const active = mode === id;
          return (
            <Button
              key={id}
              variant="quiet"
              size="sm"
              aria-current={active ? "page" : undefined}
              onClick={() => onModeChange(id)}
              className={active
                ? "relative border-accent-cyan/30 bg-accent-cyan/10 text-accent-cyan hover:bg-accent-cyan/15 hover:text-accent-cyan"
                : "shrink-0"
              }
            >
              <Icon className="h-4 w-4" />
              {label}
              {active && (
                // Active-tab marker drawn as a qubit wire with a gate node.
                <span aria-hidden="true" className="absolute inset-x-2.5 bottom-[3px] h-px bg-gradient-to-r from-transparent via-accent-cyan/70 to-transparent">
                  <span className="absolute left-1/2 top-1/2 h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-cyan shadow-[0_0_6px_rgba(34,211,238,.9)]" />
                </span>
              )}
            </Button>
          );
        })}
      </div>
    </nav>
  );
}
