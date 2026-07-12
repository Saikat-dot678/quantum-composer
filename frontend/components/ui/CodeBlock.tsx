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

export function CodeBlock({ content, label, maxHeight = "max-h-[380px]", tabs, activeTab, onTab }: Props) {
  const panelId = tabs ? `code-panel-${activeTab ?? "output"}` : undefined;
  return (
    <div className="overflow-hidden rounded-xl border border-lab-border bg-lab-surface">
      <div className="flex items-center justify-between gap-3 border-b border-lab-border bg-lab-raised/50 px-3 py-2">
        {tabs ? (
          <div role="tablist" aria-label="Generated output format" className="flex min-w-0 gap-1 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`code-panel-${tab.id}`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                onClick={() => onTab?.(tab.id)}
                className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition ${
                  activeTab === tab.id ? "bg-lab-panel text-accent-cyan" : "text-lab-faint hover:text-lab-muted"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="instrument-label">{label}</span>
        )}
        <CopyButton text={content} />
      </div>
      <pre id={panelId} role={tabs ? "tabpanel" : undefined} tabIndex={0} className={`overflow-auto ${maxHeight} p-4 font-mono text-xs leading-5 text-slate-300`}>{content}</pre>
    </div>
  );
}
