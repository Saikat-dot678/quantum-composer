"use client";

// Read-only "expand" view for a decomposition/composite instance: shows the
// exact flattened sequence lib/customGateResolve.ts would send to the
// backend (same function, so this can never drift from real behavior),
// plus the definition's Qiskit-style code preview. Expand/collapse is
// deliberately a *view* toggle only — this dialog never edits the circuit,
// so the macro's collapsed block on the canvas stays the single source of
// truth for the operation's logical identity.
import { useMemo, useRef } from "react";
import { X } from "lucide-react";
import { Button, CopyButton, StatusNotice } from "@/components/ui/primitives";
import { ModalPortal, useModalLifecycle } from "@/components/workspace/Modal";
import type { CustomDefinition } from "@/lib/customGates";
import { previewQiskitCode } from "@/lib/customGateCodePreview";
import { resolveCustomOperations } from "@/lib/customGateResolve";
import type { CircuitData, CircuitOperation } from "@/lib/types";

export function CustomGateExpandPreview({
  open,
  onClose,
  operation,
  definition,
  library,
  circuit,
}: {
  open: boolean;
  onClose: () => void;
  operation: CircuitOperation | null;
  definition: CustomDefinition | null;
  library: ReadonlyMap<string, CustomDefinition>;
  circuit: CircuitData;
}) {
  const panelRef = useRef<HTMLElement>(null);
  useModalLifecycle(open, panelRef, onClose);

  const resolved = useMemo(() => {
    if (!operation) return null;
    const single: CircuitData = { num_qubits: circuit.num_qubits, num_clbits: circuit.num_clbits, shots: circuit.shots, operations: [operation] };
    return resolveCustomOperations(single, library);
  }, [operation, circuit.num_qubits, circuit.num_clbits, circuit.shots, library]);

  const preview = useMemo(() => (definition ? previewQiskitCode(definition, library) : null), [definition, library]);

  if (!open) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="expand-preview-title" tabIndex={-1} className="flex max-h-[85vh] w-[min(36rem,100%)] flex-col rounded-xl2 border border-line bg-surface shadow-floating">
          <header className="flex items-center justify-between gap-3 border-b border-line-hairline px-5 py-3.5">
            <h2 id="expand-preview-title" className="text-sm font-semibold text-ink-900">Expanded view — {definition?.name ?? "custom operation"}</h2>
            <Button variant="quiet" size="sm" onClick={onClose} aria-label="Close expanded view"><X className="h-4 w-4" /></Button>
          </header>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {!resolved?.ok ? (
              <StatusNotice kind="error">{resolved?.reason ?? "This operation could not be expanded."}</StatusNotice>
            ) : (
              <div>
                <p className="eyebrow mb-1.5">Flattened operations ({resolved.circuit?.operations.length})</p>
                <ol className="space-y-1 font-mono text-[11px] text-ink-700">
                  {resolved.circuit?.operations
                    .slice()
                    .sort((a, b) => a.moment - b.moment)
                    .map((op, index) => (
                      <li key={index} className="rounded-md bg-surface-sunken px-2 py-1">
                        {op.gate.toUpperCase()} · q{op.qubits.join(",")}{op.clbits.length ? ` · c${op.clbits.join(",")}` : ""} · t{op.moment}
                      </li>
                    ))}
                </ol>
                <p className="mt-2 text-[11px] leading-4 text-ink-500">This is exactly what would be sent to the backend and used for the local state preview — the canvas block stays collapsed; this is a view only.</p>
              </div>
            )}
            {preview && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="eyebrow">Definition code preview</p>
                  <CopyButton text={preview} label="Copy" />
                </div>
                <pre className="max-h-56 overflow-auto rounded-lg border border-line-hairline bg-ink-900 p-3 font-mono text-[11px] leading-5 text-white">{preview}</pre>
              </div>
            )}
          </div>
        </section>
      </div>
    </ModalPortal>
  );
}
