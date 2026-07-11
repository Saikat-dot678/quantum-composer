export type Mode = "composer" | "simulator" | "crypto";

const TABS: { id: Mode; label: string }[] = [
  { id: "composer", label: "Composer" },
  { id: "simulator", label: "Simulator Lab" },
  { id: "crypto", label: "Cryptography Lab" },
];

export function ModeTabs({ mode, onModeChange }: { mode: Mode; onModeChange: (m: Mode) => void }) {
  return (
    <nav aria-label="Application modes" className="flex items-center gap-1 rounded-xl border border-lab-border bg-lab-panel p-1">
      {TABS.map((tab) => {
        const active = mode === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onModeChange(tab.id)}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              active ? "bg-accent-cyan/15 text-accent-cyan shadow-glow" : "text-lab-muted hover:text-lab-text"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
