"use client";
import { useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ComposerMode } from "@/components/composer/ComposerMode";
import { CryptographyLab } from "@/components/crypto/CryptographyLab";
import { SimulatorLab } from "@/components/simulator/SimulatorLab";
import type { Mode } from "@/components/shell/ModeTabs";
import { PRESETS } from "@/lib/presets";
import type { CircuitData } from "@/lib/types";

const cloneCircuit = (circuit: CircuitData): CircuitData => JSON.parse(JSON.stringify(circuit)) as CircuitData;

export default function Home() {
  const [mode, setMode] = useState<Mode>("composer");
  const [circuit, setCircuit] = useState<CircuitData>(() => cloneCircuit(PRESETS[1].circuit));
  // Circuit handed to the Simulator Lab when opened from the composer.
  const [labCircuit, setLabCircuit] = useState<CircuitData | null>(null);

  function changeMode(next: Mode) {
    setLabCircuit(null); // direct tab clicks start the lab from the current composer circuit
    setMode(next);
  }

  function openSimulatorLab(next: CircuitData) {
    setLabCircuit(next);
    setMode("simulator");
  }

  return (
    <AppShell mode={mode} circuit={mode === "crypto" ? null : (mode === "simulator" ? labCircuit ?? circuit : circuit)} onModeChange={changeMode}>
      {mode === "composer" && <ComposerMode circuit={circuit} setCircuit={setCircuit} onOpenSimulatorLab={openSimulatorLab} />}
      {mode === "simulator" && <SimulatorLab composerCircuit={labCircuit ?? circuit} />}
      {mode === "crypto" && <CryptographyLab />}
    </AppShell>
  );
}
