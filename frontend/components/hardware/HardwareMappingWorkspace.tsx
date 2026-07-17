"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, GitCompareArrows, KeyRound, Network, Play, RefreshCw, Upload } from "lucide-react";
import { hardwareApi } from "@/lib/hardwareApi";
import {
  DEFAULT_MANUAL_HARDWARE,
  exportManualHardware,
  parseManualHardware,
  targetKey,
} from "@/lib/hardwareFormat";
import type {
  BackendDetail,
  BackendSummary,
  CompareResponse,
  ConnectionStatus,
  HardwareCircuitSource,
  HardwareTargetSource,
  TranspileOptions,
  TranspileResponse,
} from "@/lib/hardwareTypes";
import { validateCircuitData } from "@/lib/circuitShare";
import { localCustomGateRepository } from "@/lib/customGateRepository";
import { resolveCustomOperations } from "@/lib/customGateResolve";
import type { CircuitData, CircuitOperation } from "@/lib/types";
import { Badge, Button, Callout, EmptyState, ErrorState, Toggle, inputClassName } from "@/components/ui/primitives";
import { BackendComparison, MappingResults } from "./MappingResults";
import { TopologyView } from "./TopologyView";

type CircuitMode = "composer" | "json" | "qasm2" | "qasm3" | "python";
type CatalogMode = "fake" | "ibm";

const DEFAULT_TARGET: HardwareTargetSource = { kind: "generic", topology: "line", num_qubits: 5, seed: 42, noise: true };
const DEFAULT_OPTIONS: TranspileOptions = {
  optimization_level: 1,
  seed: 42,
  initial_layout: null,
  layout_method: "sabre",
  routing_method: "sabre",
};

function remapCustomIds(circuit: CircuitData, idMap: Record<string, string>): CircuitData {
  return {
    ...circuit,
    operations: circuit.operations.map((operation: CircuitOperation) =>
      operation.gate === "custom" && operation.customId && idMap[operation.customId]
        ? { ...operation, customId: idMap[operation.customId] }
        : operation),
  };
}

function download(filename: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function sourceName(source: HardwareTargetSource): string {
  if (source.kind === "manual") return source.definition.name;
  if (source.kind === "generic") return `Generic ${source.topology} · ${source.num_qubits}q`;
  return source.name;
}

export function HardwareMappingWorkspace({
  composerCircuit,
  handoffCircuit,
  projectName,
}: {
  composerCircuit: CircuitData;
  handoffCircuit: CircuitData | null;
  projectName: string | null;
}) {
  const [circuitMode, setCircuitMode] = useState<CircuitMode>("composer");
  const [circuitSource, setCircuitSource] = useState<HardwareCircuitSource | null>(null);
  const [circuitLabel, setCircuitLabel] = useState("No circuit loaded");
  const [sourceText, setSourceText] = useState("");
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceNotice, setSourceNotice] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  const [target, setTarget] = useState<HardwareTargetSource>(DEFAULT_TARGET);
  const [targetDetail, setTargetDetail] = useState<BackendDetail | null>(null);
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [genericTopology, setGenericTopology] = useState<"line" | "ring" | "grid" | "full">("line");
  const [genericQubits, setGenericQubits] = useState(5);
  const [manualText, setManualText] = useState(() => exportManualHardware(DEFAULT_MANUAL_HARDWARE));
  const manualFileRef = useRef<HTMLInputElement>(null);

  const [catalogMode, setCatalogMode] = useState<CatalogMode>("fake");
  const [catalog, setCatalog] = useState<BackendSummary[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [minQubits, setMinQubits] = useState(1);
  const [operationalOnly, setOperationalOnly] = useState(true);
  const [dynamicOnly, setDynamicOnly] = useState(false);
  const [requiredInstruction, setRequiredInstruction] = useState("");
  const [processorFamily, setProcessorFamily] = useState("");
  const [region, setRegion] = useState("");
  const [maxPendingJobs, setMaxPendingJobs] = useState("");

  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [token, setToken] = useState("");
  const [instance, setInstance] = useState("");
  const [channel, setChannel] = useState<"ibm_quantum_platform" | "ibm_cloud">("ibm_quantum_platform");
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [options, setOptions] = useState<TranspileOptions>(DEFAULT_OPTIONS);
  const [initialLayoutText, setInitialLayoutText] = useState("");
  const [mapping, setMapping] = useState<TranspileResponse | null>(null);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [selectedLogical, setSelectedLogical] = useState<number | null>(null);
  const [selectedPhysical, setSelectedPhysical] = useState<number | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<[number, number] | null>(null);

  const [comparisonTargets, setComparisonTargets] = useState<HardwareTargetSource[]>([]);
  const [comparison, setComparison] = useState<CompareResponse | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);

  const customLibrary = useMemo(() => new Map(localCustomGateRepository.list().map((definition) => [definition.id, definition])), []);

  const loadCurrentCircuit = useCallback((candidate: CircuitData, label: string, resolvedHandoff = false) => {
    const resolved = resolveCustomOperations(candidate, customLibrary);
    if (!resolved.ok || !resolved.circuit) {
      setCircuitSource(null);
      setSourceError(resolved.reason ?? "The current circuit contains an unresolved custom definition.");
      return;
    }
    setCircuitMode("composer");
    setCircuitSource({ kind: "json", circuit: resolved.circuit });
    setCircuitLabel(label);
    setSourceError(null);
    setSourceNotice(
      candidate.operations.some((operation) => operation.gate === "custom") || resolvedHandoff
        ? "Custom definitions were resolved and flattened before hardware mapping. Logical operand identity is preserved."
        : "Loaded the active Composer circuit with its logical qubit identities intact.",
    );
  }, [customLibrary]);

  const loadTarget = useCallback(async (next: HardwareTargetSource) => {
    setTargetLoading(true);
    setTargetError(null);
    try {
      const detail = await hardwareApi.describe(next);
      setTarget(next);
      setTargetDetail(detail);
      setMapping(null);
      setComparison(null);
    } catch (error) {
      setTargetError(error instanceof Error ? error.message : "The target could not be loaded.");
    } finally {
      setTargetLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCurrentCircuit(handoffCircuit ?? composerCircuit, handoffCircuit ? `${projectName ?? "Composer project"} · explicit handoff` : `${projectName ?? "Current Composer circuit"}`, Boolean(handoffCircuit));
    void loadTarget(DEFAULT_TARGET);
    void hardwareApi.status().then(setConnection).catch((error) => setConnectionError(error instanceof Error ? error.message : "Hardware status unavailable."));
  // The handoff/current circuit is intentionally captured once when this
  // workspace opens; later Composer edits do not silently replace an active map.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function importSource() {
    setSourceError(null);
    setSourceNotice(null);
    if (circuitMode === "python") {
      setCircuitSource(null);
      setSourceError("Python source is never executed or imported. Export OpenQASM 2/3, or use the current Composer circuit.");
      return;
    }
    if (circuitMode === "composer") {
      loadCurrentCircuit(composerCircuit, projectName ?? "Current Composer circuit");
      return;
    }
    setImportLoading(true);
    try {
      let next: HardwareCircuitSource;
      if (circuitMode === "json") {
        const parsed = JSON.parse(sourceText) as unknown;
        let rawCircuit: unknown = parsed;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "circuit" in parsed) {
          const bundle = parsed as { circuit?: unknown; definitions?: unknown[] };
          rawCircuit = bundle.circuit;
          if (Array.isArray(bundle.definitions) && bundle.definitions.length) {
            const imported = localCustomGateRepository.importMany(JSON.stringify({ version: 1, definitions: bundle.definitions }));
            if (!imported.ok || !imported.value) throw new Error(imported.reason ?? "Custom definitions could not be imported.");
            const validatedBeforeRemap = validateCircuitData(rawCircuit);
            if (!validatedBeforeRemap) throw new Error("The circuit JSON does not match the validated declarative circuit format.");
            rawCircuit = remapCustomIds(validatedBeforeRemap, imported.value.idMap);
          }
        }
        const circuit = validateCircuitData(rawCircuit);
        if (!circuit) throw new Error("The circuit JSON does not match the validated declarative circuit format.");
        const library = new Map(localCustomGateRepository.list().map((definition) => [definition.id, definition]));
        const resolved = resolveCustomOperations(circuit, library);
        if (!resolved.ok || !resolved.circuit) throw new Error(resolved.reason ?? "Custom definitions could not be resolved.");
        next = { kind: "json", circuit: resolved.circuit };
      } else {
        next = { kind: circuitMode, text: sourceText };
      }
      const imported = await hardwareApi.importCircuit(next);
      setCircuitSource(next);
      setCircuitLabel(circuitMode === "json" ? "Declarative circuit JSON" : `OpenQASM ${circuitMode === "qasm2" ? "2" : "3"} import`);
      setSourceNotice(`Validated ${imported.metrics?.num_qubits ?? "?"} qubits, ${imported.metrics?.size ?? "?"} operations, depth ${imported.metrics?.depth ?? "?"}.`);
      setMapping(null);
      setComparison(null);
    } catch (error) {
      setCircuitSource(null);
      setSourceError(error instanceof Error ? error.message : "The circuit could not be imported.");
    } finally {
      setImportLoading(false);
    }
  }

  async function discoverBackends(mode = catalogMode) {
    setCatalogMode(mode);
    setCatalogLoading(true);
    setCatalogError(null);
    const query = new URLSearchParams({ source: mode, min_qubits: String(minQubits) });
    if (mode === "ibm" && operationalOnly) query.set("operational_only", "true");
    if (dynamicOnly) query.set("dynamic_circuits", "true");
    if (requiredInstruction.trim()) query.append("required_instruction", requiredInstruction.trim());
    if (mode === "ibm" && processorFamily.trim()) query.set("processor_family", processorFamily.trim());
    if (mode === "ibm" && region.trim()) query.set("region", region.trim());
    if (mode === "ibm" && maxPendingJobs.trim()) query.set("max_pending_jobs", maxPendingJobs.trim());
    try {
      const response = await hardwareApi.backends(query.toString());
      setCatalog(response.backends);
      if (response.warnings.length) setCatalogError(response.warnings.join(" "));
    } catch (error) {
      setCatalog([]);
      setCatalogError(error instanceof Error ? error.message : "Backend discovery failed.");
    } finally {
      setCatalogLoading(false);
    }
  }

  async function loadManual() {
    try {
      const definition = parseManualHardware(manualText);
      await loadTarget({ kind: "manual", definition });
    } catch (error) {
      setTargetError(error instanceof Error ? error.message : "Manual hardware JSON is invalid.");
    }
  }

  function addComparisonTarget(next = target) {
    setComparisonTargets((current) => current.some((item) => targetKey(item) === targetKey(next)) ? current : [...current, next].slice(-6));
  }

  async function runMapping() {
    if (!circuitSource) {
      setMappingError("Load and validate a circuit before transpiling.");
      return;
    }
    let initialLayout: number[] | null = null;
    if (initialLayoutText.trim()) {
      initialLayout = initialLayoutText.split(",").map((part) => Number.parseInt(part.trim(), 10));
      if (initialLayout.some((value) => !Number.isInteger(value) || value < 0)) {
        setMappingError("Initial layout must be comma-separated non-negative physical qubit indices.");
        return;
      }
    }
    const nextOptions = { ...options, initial_layout: initialLayout };
    setOptions(nextOptions);
    setMappingLoading(true);
    setMappingError(null);
    setSelectedEdge(null);
    try {
      const response = await hardwareApi.transpile(circuitSource, target, nextOptions);
      setMapping(response);
      setSelectedLogical(0);
      setSelectedPhysical(response.layout.final?.[0] ?? response.layout.initial?.[0] ?? null);
    } catch (error) {
      setMapping(null);
      setMappingError(error instanceof Error ? error.message : "Transpilation failed.");
    } finally {
      setMappingLoading(false);
    }
  }

  async function runComparison() {
    if (!circuitSource) { setComparisonError("Load a circuit before comparing targets."); return; }
    const targets = comparisonTargets.length ? comparisonTargets : [target];
    setComparisonLoading(true);
    setComparisonError(null);
    try {
      setComparison(await hardwareApi.compare(circuitSource, targets, options));
    } catch (error) {
      setComparisonError(error instanceof Error ? error.message : "Comparison failed.");
    } finally {
      setComparisonLoading(false);
    }
  }

  async function connectIbm() {
    setConnectionLoading(true);
    setConnectionError(null);
    try {
      setConnection(await hardwareApi.connect(token, instance.trim() || null, channel));
      setToken("");
      await discoverBackends("ibm");
    } catch (error) {
      setToken("");
      setConnectionError(error instanceof Error ? error.message : "IBM connection failed.");
    } finally {
      setConnectionLoading(false);
    }
  }

  const mappingDetail = targetDetail;

  return (
    <div className="mx-auto w-full max-w-[1800px] px-3 py-4 sm:px-4 lg:px-5">
      <header className="rounded-xl2 border border-line bg-surface px-4 py-4 shadow-island sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="eyebrow text-accent-700">Hardware Mapping</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">Trace a logical circuit onto a physical target</h1>
            <p className="mt-2 text-sm leading-6 text-ink-500">Resolve the circuit, inspect a real, fake, generic, or manual topology, then transpile explicitly. Mapping never submits a hardware job.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={circuitSource ? "green" : "amber"}>{circuitSource ? circuitLabel : "circuit needed"}</Badge>
            <Badge tone={targetDetail ? "cyan" : "neutral"}>{targetDetail ? targetDetail.summary.name : "target loading"}</Badge>
            <Badge tone="neutral">execution disabled</Badge>
          </div>
        </div>
      </header>

      <nav aria-label="Hardware Mapping sections" className="sticky top-14 z-30 mt-3 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface/95 p-1 shadow-sm backdrop-blur [scrollbar-width:none]">
        {[['source', '1 · Circuit'], ['target', '2 · Target'], ['options', '3 · Transpile'], ['mapping', '4 · Mapping'], ['compare', '5 · Compare']].map(([id, label]) => <a key={id} href={`#hardware-${id}`} className="min-h-9 shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-ink-500 hover:bg-ink-50 hover:text-ink-900">{label}</a>)}
      </nav>

      <div className="mt-3 grid min-w-0 gap-3 xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-3">
          <section id="hardware-source" className="scroll-mt-28 rounded-xl2 border border-line bg-surface shadow-island">
            <div className="border-b border-line-hairline px-4 py-3"><p className="eyebrow">Circuit source</p><h2 className="mt-0.5 text-sm font-semibold text-ink-900">Load logical circuit</h2></div>
            <div className="p-3">
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-ink-100 p-1" role="group" aria-label="Circuit input type">
                {([['composer', 'Composer'], ['json', 'Circuit JSON'], ['qasm2', 'OpenQASM 2'], ['qasm3', 'OpenQASM 3'], ['python', 'Python']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={circuitMode === id} onClick={() => { setCircuitMode(id); setSourceError(null); }} className={`min-h-9 rounded-md px-2 text-[11px] font-semibold ${circuitMode === id ? "bg-surface text-accent-700 shadow-sm" : "text-ink-600"}`}>{label}</button>)}
              </div>
              {circuitMode === "composer" ? <div className="mt-3 rounded-lg border border-line-hairline bg-surface-sunken p-3"><p className="text-xs font-semibold text-ink-900">{projectName ?? "Untitled Composer circuit"}</p><p className="mt-1 font-mono text-[10px] text-ink-500">{composerCircuit.num_qubits}q · {composerCircuit.operations.length} operations · {composerCircuit.shots} shots</p></div> : (
                <textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} spellCheck={false} aria-label={`${circuitMode} circuit source`} placeholder={circuitMode === "python" ? "Python is rejected. Paste only to confirm the safety boundary." : circuitMode === "json" ? '{"num_qubits":2,"num_clbits":2,"shots":1024,"operations":[]}' : "OPENQASM 2.0; …"} className={`${inputClassName} mt-3 min-h-40 resize-y font-mono text-[11px] leading-5`} />
              )}
              <Button className="mt-3 w-full" variant="secondary" loading={importLoading} onClick={() => void importSource()}>{circuitMode === "composer" ? <RefreshCw className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}{circuitMode === "composer" ? "Reload current circuit" : circuitMode === "python" ? "Reject Python safely" : "Validate and load"}</Button>
              {sourceNotice && <p role="status" className="mt-2 text-[10px] leading-4 text-safe-text">{sourceNotice}</p>}
              {sourceError && <div className="mt-2"><Callout tone="danger">{sourceError}</Callout></div>}
            </div>
          </section>

          <section id="hardware-target" className="scroll-mt-28 rounded-xl2 border border-line bg-surface shadow-island">
            <div className="border-b border-line-hairline px-4 py-3"><p className="eyebrow">Hardware source</p><h2 className="mt-0.5 text-sm font-semibold text-ink-900">Choose physical target</h2></div>
            <div className="space-y-4 p-3">
              <div>
                <p className="text-xs font-semibold text-ink-900">Generic target</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <select aria-label="Generic topology" value={genericTopology} onChange={(event) => setGenericTopology(event.target.value as typeof genericTopology)} className={inputClassName}><option value="line">Line</option><option value="ring">Ring</option><option value="grid">Grid</option><option value="full">Fully connected</option></select>
                  <input aria-label="Generic target qubits" type="number" min={2} max={genericTopology === "full" ? 64 : 512} value={genericQubits} onChange={(event) => setGenericQubits(Number(event.target.value))} className={inputClassName} />
                </div>
                <Button className="mt-2 w-full" size="sm" variant="secondary" loading={targetLoading} onClick={() => void loadTarget({ kind: "generic", topology: genericTopology, num_qubits: genericQubits, seed: 42, noise: true })}><Network className="h-3.5 w-3.5" /> Load generic target</Button>
              </div>

              <details className="border-t border-line-hairline pt-3">
                <summary className="cursor-pointer text-xs font-semibold text-ink-900">Manual hardware JSON</summary>
                <textarea value={manualText} onChange={(event) => setManualText(event.target.value)} spellCheck={false} aria-label="Manual hardware definition" className={`${inputClassName} mt-2 min-h-52 resize-y font-mono text-[10px] leading-4`} />
                <input ref={manualFileRef} type="file" accept="application/json,.json" className="sr-only" onChange={async (event) => { const file = event.target.files?.[0]; if (file) setManualText(await file.text()); event.currentTarget.value = ""; }} />
                <div className="mt-2 grid grid-cols-3 gap-1">
                  <Button size="sm" variant="secondary" onClick={() => manualFileRef.current?.click()}><Upload className="h-3.5 w-3.5" /> Import</Button>
                  <Button size="sm" variant="secondary" onClick={() => download("manual-hardware.json", manualText)}><Download className="h-3.5 w-3.5" /> Export</Button>
                  <Button size="sm" variant="primary" loading={targetLoading} onClick={() => void loadManual()}>Load</Button>
                </div>
              </details>

              <details className="border-t border-line-hairline pt-3" open>
                <summary className="cursor-pointer text-xs font-semibold text-ink-900">Fake and IBM backends</summary>
                <div className="mt-2 flex gap-1 rounded-lg bg-ink-100 p-1"><button type="button" onClick={() => void discoverBackends("fake")} className={`min-h-8 flex-1 rounded-md text-[11px] font-semibold ${catalogMode === "fake" ? "bg-surface text-accent-700" : "text-ink-600"}`}>Fake snapshots</button><button type="button" onClick={() => void discoverBackends("ibm")} className={`min-h-8 flex-1 rounded-md text-[11px] font-semibold ${catalogMode === "ibm" ? "bg-surface text-accent-700" : "text-ink-600"}`}>IBM account</button></div>
                <div className="mt-2 grid grid-cols-2 gap-2"><input aria-label="Minimum backend qubits" type="number" min={1} max={512} value={minQubits} onChange={(event) => setMinQubits(Number(event.target.value))} className={inputClassName} /><input aria-label="Required instruction" value={requiredInstruction} onChange={(event) => setRequiredInstruction(event.target.value)} placeholder="Required gate" className={inputClassName} /></div>
                {catalogMode === "ibm" && <div className="mt-2 space-y-2"><div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><input aria-label="Processor family" value={processorFamily} onChange={(event) => setProcessorFamily(event.target.value)} placeholder="Processor family" className={inputClassName} /><input aria-label="Backend region" value={region} onChange={(event) => setRegion(event.target.value)} placeholder="Region" className={inputClassName} /><input aria-label="Maximum pending jobs" type="number" min={0} value={maxPendingJobs} onChange={(event) => setMaxPendingJobs(event.target.value)} placeholder="Max queue" className={inputClassName} /></div><Toggle checked={operationalOnly} onChange={setOperationalOnly} label="Operational only" /><Toggle checked={dynamicOnly} onChange={setDynamicOnly} label="Dynamic circuits" /></div>}
                <Button className="mt-2 w-full" size="sm" variant="secondary" loading={catalogLoading} onClick={() => void discoverBackends()}><RefreshCw className="h-3.5 w-3.5" /> Discover {catalogMode === "fake" ? "installed fake snapshots" : "account backends"}</Button>
                {catalogError && <p role="alert" className="mt-2 break-words text-[10px] leading-4 text-warn-text">{catalogError}</p>}
                {catalog.length > 0 && <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto" aria-label="Discovered hardware backends">{catalog.map((backend) => <li key={`${backend.source}:${backend.name}`}><button type="button" onClick={() => void loadTarget({ kind: backend.source as "fake" | "ibm", name: backend.name })} className="w-full rounded-lg border border-line-hairline px-3 py-2 text-left hover:border-accent-400"><span className="block break-all text-[11px] font-semibold text-ink-900">{backend.name}</span><span className="mt-0.5 block text-[10px] text-ink-500">{backend.num_qubits}q · {backend.operational === false ? "offline" : backend.source === "fake" ? "static snapshot" : `${backend.pending_jobs ?? "?"} pending`}</span></button></li>)}</ul>}
              </details>

              {targetError && <Callout tone="danger">{targetError}</Callout>}
              {targetDetail && <div className="rounded-lg border border-accent-100 bg-accent-50 p-3"><p className="break-all text-xs font-semibold text-accent-700">{targetDetail.summary.name}</p><p className="mt-1 text-[10px] leading-4 text-accent-700">{targetDetail.summary.num_qubits} qubits · {targetDetail.coupling_edges.length} directed edges · {targetDetail.supported_instructions.join(", ")}</p><Button className="mt-2" size="sm" variant="secondary" onClick={() => addComparisonTarget()}>Add to comparison</Button></div>}
            </div>
          </section>

          <section className="rounded-xl2 border border-line bg-surface shadow-island">
            <div className="border-b border-line-hairline px-4 py-3"><p className="eyebrow">IBM credential boundary</p><h2 className="mt-0.5 text-sm font-semibold text-ink-900">Server-side connection</h2></div>
            <div className="space-y-3 p-3">
              <Callout tone="info">Environment variables or a trusted locally saved Qiskit account are preferred. A temporary token is sent only to FastAPI, held in server memory, never placed in URLs/projects/localStorage, and cleared from this form immediately.</Callout>
              <div className="flex flex-wrap gap-1.5"><Badge tone={connection?.connected ? "green" : "neutral"}>{connection?.connected ? "connected" : "not connected"}</Badge><Badge tone="neutral">{connection?.connection_mode ?? "checking"}</Badge>{connection?.ibm_runtime_version && <Badge tone="neutral">runtime {connection.ibm_runtime_version}</Badge>}</div>
              <details>
                <summary className="cursor-pointer text-xs font-semibold text-ink-900">Temporary session credential</summary>
                <div className="mt-2 space-y-2">
                  <input type="password" name="ibm-session-token" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="IBM Quantum API key" aria-label="Temporary IBM Quantum API key" className={inputClassName} />
                  <input value={instance} onChange={(event) => setInstance(event.target.value)} placeholder="Instance (optional)" aria-label="IBM Quantum instance" className={inputClassName} />
                  <select value={channel} onChange={(event) => setChannel(event.target.value as typeof channel)} aria-label="IBM Quantum channel" className={inputClassName}><option value="ibm_quantum_platform">ibm_quantum_platform</option><option value="ibm_cloud">ibm_cloud</option></select>
                  <Button className="w-full" variant="primary" loading={connectionLoading} disabled={token.length < 8} onClick={() => void connectIbm()}><KeyRound className="h-3.5 w-3.5" /> Connect for this server session</Button>
                </div>
              </details>
              {connection?.connected && <Button className="w-full" variant="danger" size="sm" onClick={() => void hardwareApi.disconnect().then(setConnection).catch((error) => setConnectionError(error instanceof Error ? error.message : "Disconnect failed."))}>Disconnect and clear session</Button>}
              {connectionError && <Callout tone="danger">{connectionError}</Callout>}
              <p className="text-[10px] leading-4 text-ink-500">Real execution is intentionally unavailable. This workspace discovers and maps; it never submits a job automatically or exposes a deceptive Run-on-QPU control.</p>
            </div>
          </section>
        </aside>

        <main className="min-w-0 space-y-3">
          <section id="hardware-options" className="scroll-mt-28 rounded-xl2 border border-line bg-surface shadow-island">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-hairline px-4 py-3"><div><p className="eyebrow text-accent-700">Transpiler controls</p><h2 className="mt-0.5 text-sm font-semibold text-ink-900">Map only after an explicit action</h2></div><Button variant="primary" loading={mappingLoading} onClick={() => void runMapping()}><Play className="h-3.5 w-3.5" /> Transpile and map</Button></div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
              <label className="text-[11px] font-medium text-ink-600">Optimization level<select value={options.optimization_level} onChange={(event) => setOptions((current) => ({ ...current, optimization_level: Number(event.target.value) as 0 | 1 | 2 | 3 }))} className={`${inputClassName} mt-1`}><option value={0}>0 · no optimization</option><option value={1}>1 · light</option><option value={2}>2 · balanced</option><option value={3}>3 · heavy</option></select></label>
              <label className="text-[11px] font-medium text-ink-600">Seed<input type="number" min={0} value={options.seed ?? ""} onChange={(event) => setOptions((current) => ({ ...current, seed: event.target.value ? Number(event.target.value) : null }))} className={`${inputClassName} mt-1`} /></label>
              <label className="text-[11px] font-medium text-ink-600">Initial layout<input value={initialLayoutText} onChange={(event) => setInitialLayoutText(event.target.value)} placeholder="e.g. 0,1,4" className={`${inputClassName} mt-1 font-mono`} /></label>
              <label className="text-[11px] font-medium text-ink-600">Layout method<select value={options.layout_method ?? ""} onChange={(event) => setOptions((current) => ({ ...current, layout_method: (event.target.value || null) as TranspileOptions['layout_method'] }))} className={`${inputClassName} mt-1`}><option value="">Qiskit default</option><option value="trivial">trivial</option><option value="dense">dense</option><option value="sabre">sabre</option></select></label>
              <label className="text-[11px] font-medium text-ink-600">Routing method<select value={options.routing_method ?? ""} onChange={(event) => setOptions((current) => ({ ...current, routing_method: (event.target.value || null) as TranspileOptions['routing_method'] }))} className={`${inputClassName} mt-1`}><option value="">Qiskit default</option><option value="basic">basic</option><option value="lookahead">lookahead</option><option value="sabre">sabre</option></select></label>
            </div>
            {mappingError && <div className="px-4 pb-4"><ErrorState title="Mapping failed" message={mappingError} action={<Button size="sm" onClick={() => void runMapping()}>Retry</Button>} /></div>}
          </section>

          {mappingDetail ? <TopologyView detail={mappingDetail} layout={mapping?.layout ?? null} usedEdges={mapping?.transpiled.used_edges ?? []} routingSwaps={mapping?.routing_swaps ?? []} selectedLogical={selectedLogical} selectedPhysical={selectedPhysical} selectedEdge={selectedEdge} onSelectLogical={setSelectedLogical} onSelectPhysical={setSelectedPhysical} onSelectEdge={setSelectedEdge} /> : <EmptyState title="Choose a target" description="Load a generic, fake, real IBM, or manual target to inspect its topology." />}

          <div id="hardware-mapping" className="scroll-mt-28">{mapping ? <MappingResults result={mapping} selectedLogical={selectedLogical} selectedPhysical={selectedPhysical} onSelectLogical={setSelectedLogical} onSelectPhysical={setSelectedPhysical} onSelectEdge={setSelectedEdge} /> : !mappingLoading && <EmptyState title="No mapping yet" description="Circuit and target changes do not transpile automatically. Review the options, then choose Transpile and map." action={<Button onClick={() => void runMapping()}>Transpile and map</Button>} />}</div>

          <section id="hardware-compare" className="scroll-mt-28 rounded-xl2 border border-line bg-surface p-4 shadow-island">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow text-accent-700">Backend comparison</p><h2 className="mt-0.5 text-sm font-semibold text-ink-900">Compare compatible targets</h2><p className="mt-1 text-[11px] text-ink-500">Add up to six targets while browsing. Queue is displayed but never decides the recommendation by itself.</p></div><Button variant="secondary" loading={comparisonLoading} onClick={() => void runComparison()}><GitCompareArrows className="h-3.5 w-3.5" /> Compare selected</Button></div>
            <div className="mt-3 flex flex-wrap gap-1.5">{comparisonTargets.length ? comparisonTargets.map((item) => <button key={targetKey(item)} type="button" onClick={() => setComparisonTargets((current) => current.filter((candidate) => targetKey(candidate) !== targetKey(item)))} className="min-h-8 max-w-full break-all rounded-full border border-line bg-ink-50 px-3 text-[10px] text-ink-700" title="Remove from comparison">{sourceName(item)} ×</button>) : <p className="text-[11px] text-ink-500">No saved comparison targets; the current target will be compared alone until more are added.</p>}</div>
            {comparisonError && <div className="mt-3"><Callout tone="danger">{comparisonError}</Callout></div>}
          </section>
          {comparison && <BackendComparison comparison={comparison} />}
        </main>
      </div>
    </div>
  );
}
