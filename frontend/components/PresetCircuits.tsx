import type { Preset } from "@/lib/types";

interface Props {
  presets: Preset[];
  onLoad: (preset: Preset) => void;
}

export function PresetCircuits({ presets, onLoad }: Props) {
  return (
    <section className="mt-7 border-t border-lab-border pt-6">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[.18em] text-lab-faint">Teaching presets</h2>
      <div className="space-y-1.5">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onLoad(preset)}
            title={preset.description}
            className="group w-full rounded-lg border border-transparent px-3 py-2.5 text-left transition hover:border-lab-border hover:bg-lab-raised/50"
          >
            <span className="block text-sm font-medium text-lab-muted group-hover:text-accent-cyan">{preset.name}</span>
            <span className="mt-0.5 block text-[11px] leading-4 text-lab-faint">{preset.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
