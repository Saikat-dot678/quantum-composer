"use client";
import { useState } from "react";
import type { CircuitData } from "@/lib/types";
import { CodeBlock } from "./ui/CodeBlock";

interface Props {
  circuit: CircuitData;
  code: string;
  qasm: string;
}

export function CodePanel({ circuit, code, qasm }: Props) {
  const [tab, setTab] = useState<"json" | "python" | "qasm">("json");
  const content =
    tab === "json"
      ? JSON.stringify(circuit, null, 2)
      : tab === "python"
        ? code || "# Generate or run the circuit to view Qiskit code."
        : qasm || "// Generate or run the circuit to view OpenQASM.";

  return (
    <section className="mt-6 border-t border-lab-border pt-5">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[.18em] text-lab-faint">Generated output</h2>
      <CodeBlock
        content={content}
        maxHeight="max-h-[360px]"
        activeTab={tab}
        onTab={(id) => setTab(id as typeof tab)}
        tabs={[
          { id: "json", label: "JSON" },
          { id: "python", label: "Qiskit" },
          { id: "qasm", label: "QASM" },
        ]}
      />
    </section>
  );
}
