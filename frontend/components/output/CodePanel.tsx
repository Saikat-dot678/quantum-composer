"use client";

import { useId, useState } from "react";
import { Button, Panel, SectionHeader } from "@/components/ui/primitives";
import { CodeBlock } from "@/components/ui/CodeBlock";
import type { CircuitData } from "@/lib/types";

type OutputTab = "json" | "python" | "qasm";

const TABS: { id: OutputTab; label: string }[] = [
  { id: "json", label: "Circuit JSON" },
  { id: "python", label: "Qiskit" },
  { id: "qasm", label: "OpenQASM" },
];

export function CodePanel({ circuit, code, qasm }: { circuit: CircuitData; code: string; qasm: string }) {
  const [tab, setTab] = useState<OutputTab>("json");
  const panelId = useId();
  const content = tab === "json"
    ? JSON.stringify(circuit, null, 2)
    : tab === "python"
      ? code || "# Generate outputs or run the circuit to view Qiskit code."
      : qasm || "// Generate outputs or run the circuit to view OpenQASM.";

  return (
    <Panel className="min-w-0 p-4 sm:p-5">
      <SectionHeader eyebrow="Generated artifacts" title="Circuit output" description="Declarative JSON and backend-generated source. Displayed code is never executed by the browser." />
      <div role="tablist" aria-label="Generated circuit formats" className="mb-3 flex max-w-full gap-1 overflow-x-auto rounded-lg border border-lab-border bg-lab-surface p-1">
        {TABS.map((item) => (
          <Button
            key={item.id}
            id={`${panelId}-${item.id}-tab`}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`${panelId}-panel`}
            variant="quiet"
            size="sm"
            onClick={() => setTab(item.id)}
            className={tab === item.id ? "shrink-0 border-lab-borderStrong bg-lab-raised text-accent-cyan" : "shrink-0"}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <div id={`${panelId}-panel`} role="tabpanel" aria-labelledby={`${panelId}-${tab}-tab`} tabIndex={0}>
        <CodeBlock content={content} label={TABS.find((item) => item.id === tab)?.label} maxHeight="max-h-[430px]" />
      </div>
    </Panel>
  );
}
