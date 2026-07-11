import type { ReactNode } from "react";
import { ModeTabs, type Mode } from "./ModeTabs";

export function AppShell({ mode, onModeChange, children }: { mode: Mode; onModeChange: (m: Mode) => void; children: ReactNode }) {
  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-lab-border bg-lab-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4 px-5 py-3 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-lab-panel text-lg text-accent-cyan ring-1 ring-accent-cyan/30 shadow-glow">
              ψ
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-lab-text">Quantum Composer</h1>
              <p className="text-[11px] text-lab-faint">Composer · multi-engine simulator · quantum cryptography lab</p>
            </div>
          </div>
          <ModeTabs mode={mode} onModeChange={onModeChange} />
        </div>
      </header>

      {children}

      <footer className="border-t border-lab-border px-5 pb-8 pt-6 text-center text-[11px] leading-5 text-lab-faint">
        Educational project inspired by visual quantum circuit composers. Not affiliated with or produced by IBM.
        <br />
        Large-circuit support applies to structured (Clifford / low-entanglement MPS) circuits only; arbitrary 100-qubit statevector simulation is infeasible and is rejected with an explanation.
      </footer>
    </main>
  );
}
