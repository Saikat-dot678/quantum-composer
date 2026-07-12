"use client";

import { useRef, type KeyboardEvent } from "react";
import { PROTOCOLS, type Protocol } from "./config";

export function ProtocolTabs({ protocol, onChange, disabled = false }: { protocol: Protocol; onChange: (protocol: Protocol) => void; disabled?: boolean }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function activate(index: number) {
    const normalized = (index + PROTOCOLS.length) % PROTOCOLS.length;
    onChange(PROTOCOLS[normalized].id);
    refs.current[normalized]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      activate(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      activate(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      activate(0);
    } else if (event.key === "End") {
      event.preventDefault();
      activate(PROTOCOLS.length - 1);
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Quantum cryptography protocols"
      aria-orientation="horizontal"
      className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
    >
      {PROTOCOLS.map((item, index) => {
        const active = protocol === item.id;
        return (
          <button
            key={item.id}
            ref={(node) => { refs.current[index] = node; }}
            id={`protocol-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls="protocol-workspace"
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onClick={() => onChange(item.id)}
            className={`group relative min-h-[66px] min-w-[172px] flex-1 overflow-hidden rounded-xl border px-3.5 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-lab-bg disabled:cursor-not-allowed disabled:opacity-50 ${active ? "border-accent-cyan/55 bg-accent-cyan/[.09] shadow-glow" : "border-lab-border bg-lab-panel/60 hover:border-lab-borderStrong hover:bg-lab-raised/60"}`}
          >
            <span className="flex items-start justify-between gap-3">
              <span>
                <span className={`block font-display text-sm font-semibold ${active ? "text-accent-cyan" : "text-lab-text"}`}>{item.name}</span>
                <span className="mt-0.5 block text-[10px] leading-4 text-lab-faint">{item.shortLabel}</span>
              </span>
              <span className={`font-mono text-[10px] ${active ? "text-accent-cyan/80" : "text-lab-faint"}`}>{String(index + 1).padStart(2, "0")}</span>
            </span>
            <span className={`absolute inset-x-3.5 bottom-0 h-px ${active ? "bg-gradient-to-r from-accent-cyan via-accent-cyan/70 to-transparent" : "bg-transparent"}`} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
