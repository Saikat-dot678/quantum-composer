"use client";
import { CopyButton } from "./primitives";

interface Props {
  content: string;
  label?: string;
  maxHeight?: string;
  tabs?: { id: string; label: string }[];
  activeTab?: string;
  onTab?: (id: string) => void;
}

// Polished, scrollable, copyable code panel for JSON / Qiskit / QASM / diagrams.
export function CodeBlock({ content, label, maxHeight = "max-h-[380px]", tabs, activeTab, onTab }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-lab-border bg-lab-surface">
      <div className="flex items-center justify-between border-b border-lab-border bg-lab-raised/50 px-3 py-2">
        {tabs ? (
          <div className="flex gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTab?.(t.id)}
                className={`rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition ${
                  activeTab === t.id ? "bg-lab-panel text-accent-cyan" : "text-lab-faint hover:text-lab-muted"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-lab-faint">{label}</span>
        )}
        <CopyButton text={content} />
      </div>
      <pre className={`overflow-auto ${maxHeight} p-3 font-mono text-[11px] leading-5 text-slate-300`}>{content}</pre>
    </div>
  );
}
