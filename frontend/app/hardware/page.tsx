"use client";

import { useRef } from "react";
import { HardwareMappingWorkspace } from "@/components/hardware/HardwareMappingWorkspace";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

export default function HardwarePage() {
  const workspace = useWorkspace();
  const handoff = useRef(workspace.hardwareCircuit).current;

  return (
    <HardwareMappingWorkspace
      composerCircuit={workspace.circuit}
      handoffCircuit={handoff}
      projectName={workspace.activeProjectName}
    />
  );
}
