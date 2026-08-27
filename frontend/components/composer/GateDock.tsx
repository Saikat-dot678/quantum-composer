"use client";

// Searchable operation catalog. Semantic definitions live in gateRegistry;
// this component owns only palette interaction and presentation.
import { useMemo, useState } from "react";
import { Library, Plus, Search } from "lucide-react";
import type { CustomDefinition } from "@/lib/customGates";
import { GATE_CATEGORIES, GATE_DEFINITIONS } from "@/lib/gateRegistry";
import type { GateName, Preset } from "@/lib/types";
import { CustomGateGlyph } from "./CustomGateGlyph";

export { GATE_DEFINITIONS } from "@/lib/gateRegistry";

export function GateDock({ selected, onSelect, presets, onLoadPreset, customDefinitions, selectedCustomId, onSelectCustom, onOpenLibrary, onCreateCustom }: {
  selected: GateName;
  onSelect: (gate: GateName) => void;
  presets: Preset[];
  onLoadPreset: (preset: Preset) => void;
  customDefinitions: CustomDefinition[];
  selectedCustomId: string | null;
  onSelectCustom: (id: string) => void;
  onOpenLibrary: () => void;
  onCreateCustom: () => void;
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"gates" | "presets">("gates");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const definitions = Object.values(GATE_DEFINITIONS);
    if (!needle) return definitions;
    return definitions.filter((gate) =>
      gate.label.toLowerCase().includes(needle)
      || gate.name.toLowerCase().includes(needle)
      || gate.id.includes(needle)
      || gate.aliases.some((alias) => alias.includes(needle)),
    );
  }, [query]);

  const filteredCustom = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return customDefinitions;
    return customDefinitions.filter((definition) =>
      definition.label.toLowerCase().includes(needle) || definition.name.toLowerCase().includes(needle),
    );
  }, [query, customDefinitions]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl2 border border-line bg-surface shadow-floating">
      <div className="flex border-b border-line-hairline p-1">
        {(["gates", "presets"] as const).map((id) => (
          <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)} className={`min-h-8 flex-1 rounded-lg text-xs font-semibold capitalize transition-colors ${tab === id ? "bg-accent-50 text-accent-700" : "text-ink-500 hover:text-ink-900"}`}>
            {id}
          </button>
        ))}
      </div>

      {tab === "gates" ? (
        <>
          <div className="relative border-b border-line-hairline p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" aria-hidden="true" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search gates…" aria-label="Search gate library" className="min-h-9 w-full rounded-lg border border-line-hairline bg-surface-sunken py-1.5 pl-8 pr-2 text-xs text-ink-900 outline-none focus:border-accent-500" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {GATE_CATEGORIES.map((category) => {
              const gates = filtered.filter((gate) => gate.category === category);
              if (gates.length === 0) return null;
              return (
                <div key={category} className="mb-3">
                  <p className="eyebrow mb-1.5 px-1">{category}</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {gates.map((gate) => {
                      const active = selected === gate.id;
                      return (
                        <button key={gate.id} type="button" draggable onDragStart={(event) => { event.dataTransfer.setData("application/x-quantum-gate", gate.id); event.dataTransfer.effectAllowed = "copy"; onSelect(gate.id); }} aria-pressed={active} aria-label={`${gate.name}. ${gate.description}`} title={gate.description} onClick={() => onSelect(gate.id)} className={`flex min-h-10 cursor-grab flex-col items-center justify-center rounded-lg border px-1 font-mono text-[11px] font-semibold transition-colors active:cursor-grabbing ${active ? "border-accent-500 bg-accent-50 text-accent-700 shadow-sm" : "border-line-hairline bg-surface-sunken text-ink-700 hover:border-accent-300 hover:text-ink-900"}`}>
                          {gate.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="mb-1">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <p className="eyebrow">Custom</p>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={onCreateCustom} aria-label="Create a new custom gate or operation" title="Create a new custom gate or operation" className="rounded-md p-1 text-ink-500 hover:bg-surface-sunken hover:text-ink-900"><Plus className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={onOpenLibrary} aria-label="Open the custom gate library" title="Open the custom gate library" className="rounded-md p-1 text-ink-500 hover:bg-surface-sunken hover:text-ink-900"><Library className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              {filteredCustom.length === 0 ? (
                <button type="button" onClick={onCreateCustom} className="w-full rounded-lg border border-dashed border-line-hairline px-2.5 py-2.5 text-left text-[11px] leading-4 text-ink-500 hover:border-accent-300 hover:text-ink-900">
                  {customDefinitions.length === 0 ? "No custom gates yet — create one from a matrix, a gate sequence, or a canvas selection." : `No custom gates match “${query}”.`}
                </button>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {filteredCustom.map((definition) => {
                    const active = selected === "custom" && selectedCustomId === definition.id;
                    return (
                      <button key={definition.id} type="button" draggable onDragStart={(event) => { event.dataTransfer.setData("application/x-quantum-gate", "custom"); event.dataTransfer.setData("application/x-quantum-custom-id", definition.id); event.dataTransfer.effectAllowed = "copy"; onSelectCustom(definition.id); }} onClick={() => onSelectCustom(definition.id)} aria-pressed={active} aria-label={`${definition.name}. ${definition.description || `Custom ${definition.kind} operation.`}`} title={definition.description || definition.name} className={`flex min-h-10 cursor-grab flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1.5 font-mono text-[10px] font-semibold transition-colors active:cursor-grabbing ${active ? "border-accent-500 bg-accent-50 text-accent-700 shadow-sm" : "border-line-hairline bg-surface-sunken text-ink-700 hover:border-accent-300 hover:text-ink-900"}`}>
                        <CustomGateGlyph icon={definition.icon} size={14} />
                        <span className="max-w-full truncate">{definition.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {filtered.length === 0 && filteredCustom.length === 0 && query && <p className="px-1 py-6 text-center text-xs text-ink-500">No gates match “{query}”.</p>}
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <p className="eyebrow mb-1.5 px-1">Teaching presets</p>
          <div className="space-y-1">
            {presets.map((preset) => (
              <button key={preset.id} type="button" onClick={() => onLoadPreset(preset)} className="w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-sunken">
                <span className="block text-xs font-semibold text-ink-900">{preset.name}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-ink-500">{preset.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
