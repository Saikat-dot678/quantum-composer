import { PROTOCOLS, type Protocol } from "./config";

export function ProtocolTabs({ protocol, onChange, disabled = false }: { protocol: Protocol; onChange: (protocol: Protocol) => void; disabled?: boolean }) {
  return (
    <div role="tablist" aria-label="Quantum cryptography protocol" className="space-y-1.5">
      {PROTOCOLS.map((item) => {
        const active = protocol === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls="protocol-workspace"
            disabled={disabled}
            onClick={() => onChange(item.id)}
            className={`group w-full rounded-lg border px-3 py-2.5 text-left transition ${active ? "border-accent-cyan/45 bg-accent-cyan/[.08] shadow-glow" : "border-transparent hover:border-lab-border hover:bg-lab-raised/45"}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className={`font-display text-sm font-semibold ${active ? "text-accent-cyan" : "text-lab-muted group-hover:text-lab-text"}`}>{item.name}</span>
              <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-accent-cyan" : "bg-lab-borderStrong"}`} aria-hidden="true" />
            </span>
            <span className="mt-0.5 block text-[11px] leading-4 text-lab-faint">{item.subtitle}</span>
          </button>
        );
      })}
    </div>
  );
}
