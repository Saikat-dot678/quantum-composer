"use client";

import { Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { SimulatorLab } from "@/components/simulator/SimulatorLab";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

function SimulatorRoute() {
  const searchParams = useSearchParams();
  const { circuit, labCircuit } = useWorkspace();
  const handoffRef = useRef(labCircuit);

  return (
    <SimulatorLab
      composerCircuit={circuit}
      initialCircuit={handoffRef.current ?? undefined}
      initialEngineParam={searchParams.get("engine")}
      initialSourceParam={searchParams.get("source")}
    />
  );
}

function SimulatorFallback() {
  return (
    <div className="mx-auto max-w-[1920px] px-4 py-5" role="status" aria-live="polite">
      <div className="min-h-[28rem] animate-pulse border border-lab-borderStrong bg-lab-panel p-5">
        <p className="instrument-label text-accent-cyan">Simulator Lab</p>
        <p className="mt-2 text-sm font-semibold text-lab-text">Preparing the analysis workbench…</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <span className="h-20 bg-lab-raised/60" />
          <span className="h-20 bg-lab-raised/60" />
          <span className="h-20 bg-lab-raised/60" />
        </div>
      </div>
    </div>
  );
}

export default function SimulatorPage() {
  return (
    <Suspense fallback={<SimulatorFallback />}>
      <SimulatorRoute />
    </Suspense>
  );
}
