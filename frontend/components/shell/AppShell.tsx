"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { analyzeLocally } from "@/lib/feasibility";
import { labApi } from "@/lib/labApi";
import type { CircuitData } from "@/lib/types";
import type { Mode } from "./ModeTabs";
import { StatusStrip, type BackendStatus } from "./StatusStrip";
import { TopBar } from "./TopBar";

export function AppShell({
  mode,
  circuit,
  onModeChange,
  children,
}: {
  mode: Mode;
  /** Live composer circuit; drives the telemetry strip in every mode. */
  circuit: CircuitData | null;
  onModeChange: (mode: Mode) => void;
  children: ReactNode;
}) {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const healthRequest = useRef(0);

  const checkBackend = useCallback(async (showChecking = true) => {
    const token = ++healthRequest.current;
    if (showChecking) setBackendStatus("checking");
    try {
      const response = await labApi.health();
      if (healthRequest.current === token) setBackendStatus(response.status === "ok" ? "online" : "offline");
    } catch {
      if (healthRequest.current === token) setBackendStatus("offline");
    }
  }, []);

  useEffect(() => {
    void checkBackend();
    const interval = window.setInterval(() => void checkBackend(false), 30_000);
    return () => {
      window.clearInterval(interval);
      healthRequest.current += 1;
    };
  }, [checkBackend]);

  const feasibility = useMemo(() => (circuit ? analyzeLocally(circuit) : null), [circuit]);

  return (
    <div className="min-h-screen overflow-x-clip">
      <a href="#main-content" className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-md bg-accent-cyan px-3 py-2 text-sm font-semibold text-lab-bg transition focus:translate-y-0">
        Skip to workspace
      </a>
      <header className="sticky top-0 z-50 bg-lab-bg/95 shadow-[0_12px_32px_rgba(0,0,0,.28)] backdrop-blur-xl">
        <TopBar mode={mode} onModeChange={onModeChange} backendStatus={backendStatus} onRetryBackend={() => void checkBackend(true)} />
        <StatusStrip mode={mode} backendStatus={backendStatus} feasibility={feasibility} />
        <div className="coherence-line" aria-hidden="true" />
      </header>

      <main id="main-content" tabIndex={-1} className="outline-none">
        {children}
      </main>

      <footer className="border-t border-lab-border bg-lab-surface/65 px-5 py-6 text-center text-xs leading-5 text-lab-faint">
        <p>Educational simulator · Not affiliated with IBM · No real-hardware execution is configured.</p>
        <p className="mt-1">Arbitrary 100-qubit statevector simulation is infeasible. Larger circuits are supported only when stabilizer or low-entanglement MPS structure makes them tractable.</p>
      </footer>
    </div>
  );
}
