"use client";

// Collapsible bottom dock (reference study #10 Sentry progressive
// disclosure): generated code and simulation results stay one interaction
// away instead of permanently occupying half the screen. Auto-opens after a
// run so results are never hidden from a first-time user, but the canvas
// keeps the viewport otherwise.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronUp } from "lucide-react";
import { CodePanel } from "@/components/output/CodePanel";
import { ResultsPanel, type ResultView } from "@/components/output/ResultsPanel";
import type { CircuitData } from "@/lib/types";

export function OutputDock({
  circuit,
  code,
  qasm,
  result,
  running,
  autoExpandKey,
}: {
  circuit: CircuitData;
  code: string;
  qasm: string;
  result: ResultView | null;
  running: boolean;
  /** Changing this value (e.g. a run counter) auto-expands the dock. */
  autoExpandKey: number;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (autoExpandKey > 0) setOpen(true);
  }, [autoExpandKey]);

  return (
    <div className="border-t border-line-hairline bg-surface">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="output-dock-panel"
        className="flex min-h-10 w-full items-center justify-between px-4 text-xs font-semibold text-ink-700 hover:text-ink-900"
      >
        <span>Code &amp; results{running && <span className="ml-2 font-normal text-accent-600">running…</span>}{result && !running && <span className="ml-2 font-normal text-ink-500">· {Object.values(result.counts).reduce((s, v) => s + v, 0).toLocaleString()} shots</span>}</span>
        <motion.span animate={{ rotate: open ? 0 : 180 }} transition={{ duration: 0.15 }}>
          <ChevronUp className="h-4 w-4" aria-hidden="true" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="output-dock-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "min(52vh, 620px)", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="grid h-[min(52vh,620px)] min-w-0 gap-4 overflow-y-auto p-4 xl:grid-cols-2">
              <CodePanel circuit={circuit} code={code} qasm={qasm} />
              <ResultsPanel result={result} running={running} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
