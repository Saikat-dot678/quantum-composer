"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ComposerMode } from "@/components/composer/ComposerMode";
import { useToast } from "@/components/workspace/ToastProvider";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { decodeCircuitParamDetailed, decodeCompressedCircuitParamDetailed } from "@/lib/circuitShare";
import { localCustomGateRepository } from "@/lib/customGateRepository";
import type { CircuitData, CircuitOperation } from "@/lib/types";

function remapCustomIds(circuit: CircuitData, idMap: Record<string, string>): CircuitData {
  return {
    ...circuit,
    operations: circuit.operations.map((operation: CircuitOperation) =>
      operation.gate === "custom" && operation.customId && idMap[operation.customId]
        ? { ...operation, customId: idMap[operation.customId] }
        : operation),
  };
}

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
      const decoded = compressed ? await decodeCompressedCircuitParamDetailed(compressed) : legacy ? decodeCircuitParamDetailed(legacy) : null;
      if (decoded?.ok && decoded.circuit) {
        let circuit = decoded.circuit;
        const definitions = decoded.definitions ?? [];
        if (definitions.length > 0) {
          const imported = localCustomGateRepository.importMany(JSON.stringify({ version: 1, definitions }));
          if (imported.ok && imported.value) {
            circuit = remapCustomIds(circuit, imported.value.idMap);
          } else {
            pushToast(`This shared circuit's custom gates could not be imported (${imported.reason ?? "unknown error"}); it was ignored.`, "error");
            router.replace("/composer");
            return;
          }
        }
        workspace.loadCircuit(circuit);
        workspace.detachProject();
      } else {
        pushToast(decoded?.reason ? `That shared link is invalid or contains an unsupported circuit — ${decoded.reason}` : "That shared link is invalid or contains an unsupported circuit; it was ignored.", "error");
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
