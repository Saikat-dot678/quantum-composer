"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ComposerMode } from "@/components/composer/ComposerMode";
import { useToast } from "@/components/workspace/ToastProvider";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { decodeCircuitParam, decodeCompressedCircuitParam } from "@/lib/circuitShare";
import type { CircuitData } from "@/lib/types";

function ComposerRoute() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspace = useWorkspace();
  const { pushToast } = useToast();
  const consumedShare = useRef(false);

  // A shared link (`?c2=` compressed, `?c=` legacy) loads its circuit exactly
  // once, then cleans the URL so refreshes and autosave behave normally.
  useEffect(() => {
    if (consumedShare.current) return;
    const compressed = searchParams.get("c2");
    const legacy = searchParams.get("c");
    if (!compressed && !legacy) return;
    consumedShare.current = true;
    void (async () => {
      const decoded = compressed ? await decodeCompressedCircuitParam(compressed) : legacy ? decodeCircuitParam(legacy) : null;
      if (decoded) {
        workspace.loadCircuit(decoded);
        workspace.detachProject();
      } else {
        pushToast("That shared link is invalid or contains an unsupported circuit; it was ignored.", "error");
      }
      router.replace("/composer");
    })();
  }, [searchParams, workspace, router, pushToast]);

  function openSimulatorLab(next: CircuitData) {
    workspace.setLabCircuit(next);
    router.push("/simulator");
  }

  return <ComposerMode circuit={workspace.circuit} setCircuit={workspace.setCircuit} onOpenSimulatorLab={openSimulatorLab} />;
}

export default function ComposerPage() {
  // useSearchParams requires a Suspense boundary during prerender.
  return (
    <Suspense fallback={null}>
      <ComposerRoute />
    </Suspense>
  );
}
