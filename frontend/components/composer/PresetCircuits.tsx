import { Button } from "@/components/ui/primitives";
import type { Preset } from "@/lib/types";

export function PresetCircuits({ presets, onLoad }: { presets: Preset[]; onLoad: (preset: Preset) => void }) {
  return (
    <section className="mt-6 border-t border-lab-border pt-5" aria-labelledby="composer-presets-heading">
      <h2 id="composer-presets-heading" className="instrument-label">Teaching presets</h2>
      <div className="mt-2 space-y-1">
        {presets.map((preset) => (
          <Button
            key={preset.id}
            variant="quiet"
            size="sm"
            onClick={() => onLoad(preset)}
            className="h-auto w-full justify-start px-2.5 py-2.5 text-left"
          >
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-lab-muted">{preset.name}</span>
              <span className="mt-0.5 block whitespace-normal text-[11px] font-normal leading-4 text-lab-faint">{preset.description}</span>
            </span>
          </Button>
        ))}
      </div>
    </section>
  );
}
