"use client";

// Floating, searchable gate palette (reference study #6 Raycast list rows,
// #9 IBM Composer categorized catalog). Chips are draggable onto the canvas
// (progressive enhancement) and remain clickable — click-to-place stays the
// accessible, keyboard-and-touch-safe baseline; dragging never becomes the
// only way to place a gate.
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { GateName, Preset } from "@/lib/types";

export interface GateDefinition {
  id: GateName;
  label: string;
  name: string;
  description: string;
  category: "Single-qubit" | "Rotations" | "Two-qubit" | "Utility";
}

export const GATE_DEFINITIONS: Record<GateName, GateDefinition> = {
  x: { id: "x", label: "X", name: "Pauli X", description: "Flips |0〉 and |1〉, analogous to a classical NOT operation.", category: "Single-qubit" },
  y: { id: "y", label: "Y", name: "Pauli Y", description: "Combines a bit flip with a phase rotation around the Y axis.", category: "Single-qubit" },
  z: { id: "z", label: "Z", name: "Pauli Z", description: "Applies a phase flip to the |1〉 component.", category: "Single-qubit" },
  h: { id: "h", label: "H", name: "Hadamard", description: "Creates or removes an equal superposition in the computational basis.", category: "Single-qubit" },
  s: { id: "s", label: "S", name: "S phase", description: "Applies a quarter-turn phase; it remains Clifford-compatible.", category: "Single-qubit" },
  t: { id: "t", label: "T", name: "T phase", description: "Applies an eighth-turn phase and makes a circuit non-Clifford.", category: "Single-qubit" },
  rx: { id: "rx", label: "RX", name: "X rotation", description: "Rotates one qubit around the Bloch-sphere X axis by θ radians.", category: "Rotations" },
  ry: { id: "ry", label: "RY", name: "Y rotation", description: "Rotates one qubit around the Bloch-sphere Y axis by θ radians.", category: "Rotations" },
  rz: { id: "rz", label: "RZ", name: "Z rotation", description: "Rotates one qubit around the Bloch-sphere Z axis by θ radians.", category: "Rotations" },
  cx: { id: "cx", label: "CX", name: "Controlled X", description: "Choose a control qubit, then a target qubit in the same time step.", category: "Two-qubit" },
  cz: { id: "cz", label: "CZ", name: "Controlled Z", description: "Applies a Z phase when both selected qubits are |1〉.", category: "Two-qubit" },
  swap: { id: "swap", label: "SWAP", name: "Swap", description: "Exchanges the quantum states of two selected qubits.", category: "Two-qubit" },
  measure: { id: "measure", label: "M", name: "Measurement", description: "Measures into the matching classical bit, or the last available bit.", category: "Utility" },
  barrier: { id: "barrier", label: "‖", name: "Barrier", description: "Places a full-register scheduling barrier at the selected time step.", category: "Utility" },
};

const GROUPS: GateDefinition["category"][] = ["Single-qubit", "Rotations", "Two-qubit", "Utility"];

export function GateDock({
  selected,
  onSelect,
  presets,
  onLoadPreset,
}: {
  selected: GateName;
  onSelect: (gate: GateName) => void;
  presets: Preset[];
  onLoadPreset: (preset: Preset) => void;
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"gates" | "presets">("gates");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const defs = Object.values(GATE_DEFINITIONS);
    if (!needle) return defs;
    return defs.filter((gate) => gate.label.toLowerCase().includes(needle) || gate.name.toLowerCase().includes(needle) || gate.id.includes(needle));
  }, [query]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl2 border border-line bg-surface shadow-floating">
      <div className="flex border-b border-line-hairline p-1">
        {(["gates", "presets"] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className={`min-h-8 flex-1 rounded-lg text-xs font-semibold capitalize transition-colors ${tab === id ? "bg-accent-50 text-accent-700" : "text-ink-500 hover:text-ink-900"}`}
          >
            {id}
          </button>
        ))}
      </div>

      {tab === "gates" ? (
        <>
          <div className="relative border-b border-line-hairline p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search gates…"
              aria-label="Search gate library"
              className="min-h-9 w-full rounded-lg border border-line-hairline bg-surface-sunken py-1.5 pl-8 pr-2 text-xs text-ink-900 outline-none focus:border-accent-500"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {GROUPS.map((group) => {
              const gates = filtered.filter((gate) => gate.category === group);
              if (gates.length === 0) return null;
              return (
                <div key={group} className="mb-3">
                  <p className="eyebrow mb-1.5 px-1">{group}</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {gates.map((gate) => {
                      const active = selected === gate.id;
                      return (
                        <button
                          key={gate.id}
                          type="button"
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData("application/x-quantum-gate", gate.id);
                            event.dataTransfer.effectAllowed = "copy";
                            onSelect(gate.id);
                          }}
                          aria-pressed={active}
                          aria-label={`${gate.name}. ${gate.description}`}
                          title={gate.description}
                          onClick={() => onSelect(gate.id)}
                          className={`flex min-h-10 cursor-grab flex-col items-center justify-center rounded-lg border font-mono text-xs font-semibold transition-colors active:cursor-grabbing ${
                            active ? "border-accent-500 bg-accent-50 text-accent-700 shadow-sm" : "border-line-hairline bg-surface-sunken text-ink-700 hover:border-accent-300 hover:text-ink-900"
                          }`}
                        >
                          {gate.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <p className="px-1 py-6 text-center text-xs text-ink-500">No gates match “{query}”.</p>}
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <p className="eyebrow mb-1.5 px-1">Teaching presets</p>
          <div className="space-y-1">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onLoadPreset(preset)}
                className="w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-sunken"
              >
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
