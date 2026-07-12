"use client";

import { useEffect, useRef, useState } from "react";
import { PlayIcon, ShieldIcon } from "@/components/ui/icons";
import { Badge, Button, ErrorState } from "@/components/ui/primitives";
import { useRegisterActions, type RegisteredAction } from "@/components/workspace/ActionRegistry";
import { useToast } from "@/components/workspace/ToastProvider";
import { labApi } from "@/lib/labApi";
import type { BB84Result, B92Result, E91Result, QRNGResult } from "@/lib/labTypes";
import { BB84Panel } from "./BB84Panel";
import { B92Panel } from "./B92Panel";
import { getProtocolDefinition, PROTOCOLS, type Protocol } from "./config";
import styles from "./cryptoLab.module.css";
import { E91Panel } from "./E91Panel";
import { DEFAULT_CRYPTO_PREFERENCES, loadCryptoPreferences, saveCryptoPreferences } from "./preferences";
import { ProtocolBrief } from "./ProtocolBrief";
import { ProtocolControlPanel } from "./ProtocolControlPanel";
import { ProtocolFlow } from "./ProtocolFlow";
import { ProtocolTabs } from "./ProtocolTabs";
import { QRNGPanel } from "./QRNGPanel";

type SnapshotMap = Partial<Record<Protocol, string>>;
type VersionMap = Partial<Record<Protocol, number>>;

function EmptyProtocolStage({ protocol, onRun }: { protocol: Protocol; onRun: () => void }) {
  const definition = getProtocolDefinition(protocol);
  return (
    <div className={`flex min-h-[330px] items-center justify-center px-5 py-10 text-center ${styles.stageGrid}`}>
      <div className="max-w-md">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-accent-cyan/30 bg-accent-cyan/[.07] text-accent-cyan shadow-glow">
          <ShieldIcon className="h-6 w-6" />
        </div>
        <p className="instrument-label mt-5 text-accent-cyan">Configuration armed</p>
        <h3 className="mt-1 font-display text-lg font-semibold text-lab-text">Observe the first {definition.name} run</h3>
        <p className="mt-2 text-xs leading-5 text-lab-muted">{definition.summary} The signal path above previews the current controls before any request is sent.</p>
        <Button variant="primary" className="mt-5" onClick={onRun}><PlayIcon className="h-4 w-4" />Run {definition.name}</Button>
      </div>
    </div>
  );
}

function LoadingProtocolStage({ protocol }: { protocol: Protocol }) {
  const definition = getProtocolDefinition(protocol);
  return (
    <div className={`min-h-[330px] px-5 py-8 ${styles.stageGrid}`} role="status" aria-live="polite">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3 text-sm font-semibold text-lab-text">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-lab-borderStrong border-t-accent-cyan motion-reduce:animate-none" aria-hidden="true" />
          Running {definition.name} protocol model…
        </div>
        <p className="mt-1 text-xs text-lab-faint">The request is bounded by the protocol endpoint limits; no circuit state or user code is executed.</p>
        <div className="mt-7 space-y-3" aria-hidden="true">
          {[76, 92, 64, 84].map((width, index) => (
            <div key={width} className={`h-12 rounded-lg border border-lab-border bg-lab-raised/35 ${styles.busyScan}`} style={{ width: `${width}%`, marginLeft: index % 2 ? "auto" : 0 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function CryptographyLab() {
  const [protocol, setProtocol] = useState<Protocol>(DEFAULT_CRYPTO_PREFERENCES.protocol);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numBits, setNumBits] = useState(DEFAULT_CRYPTO_PREFERENCES.numBits);
  const [eveEnabled, setEveEnabled] = useState(DEFAULT_CRYPTO_PREFERENCES.eveEnabled);
  const [channelError, setChannelError] = useState(DEFAULT_CRYPTO_PREFERENCES.channelError);
  const [seed, setSeed] = useState<number | "">(DEFAULT_CRYPTO_PREFERENCES.seed);
  const [bb84, setBb84] = useState<BB84Result | null>(null);
  const [e91, setE91] = useState<E91Result | null>(null);
  const [b92, setB92] = useState<B92Result | null>(null);
  const [qrng, setQrng] = useState<QRNGResult | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotMap>({});
  const [versions, setVersions] = useState<VersionMap>({});
  const [preferencesReady, setPreferencesReady] = useState(false);
  const requestToken = useRef(0);
  const { pushToast } = useToast();

  const definition = getProtocolDefinition(protocol);
  const seedValue = seed === "" ? null : seed;
  const signature = JSON.stringify({
    protocol,
    numBits,
    eveEnabled: protocol === "bb84" || protocol === "e91" ? eveEnabled : false,
    channelError: protocol === "qrng" ? 0 : channelError,
    seed: seedValue,
  });
  const hasResult = protocol === "bb84" ? Boolean(bb84) : protocol === "e91" ? Boolean(e91) : protocol === "b92" ? Boolean(b92) : Boolean(qrng);
  const stale = hasResult && snapshots[protocol] !== signature;

  useEffect(() => {
    const preferences = loadCryptoPreferences();
    setProtocol(preferences.protocol);
    setNumBits(preferences.numBits);
    setEveEnabled(preferences.eveEnabled);
    setChannelError(preferences.channelError);
    setSeed(preferences.seed);
    setPreferencesReady(true);
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    saveCryptoPreferences({ protocol, numBits, eveEnabled, channelError, seed });
  }, [channelError, eveEnabled, numBits, preferencesReady, protocol, seed]);

  function invalidatePending() {
    requestToken.current += 1;
    setBusy(false);
    setError(null);
  }

  function changeProtocol(next: Protocol) {
    invalidatePending();
    setProtocol(next);
    setNumBits((value) => Math.min(next === "qrng" ? 8192 : 4096, value));
  }

  function changeNumBits(value: number) {
    invalidatePending();
    const max = protocol === "qrng" ? 8192 : 4096;
    setNumBits(Math.max(16, Math.min(max, Math.trunc(value))));
  }

  function changeChannelError(value: number) {
    invalidatePending();
    setChannelError(Math.max(0, Math.min(0.5, value)));
  }

  function changeEve(value: boolean) {
    invalidatePending();
    setEveEnabled(value);
  }

  function changeSeed(value: number | "") {
    invalidatePending();
    setSeed(value);
  }

  async function run() {
    const token = ++requestToken.current;
    const runProtocol = protocol;
    const runDefinition = getProtocolDefinition(runProtocol);
    const runSignature = signature;
    setBusy(true);
    setError(null);
    try {
      if (runProtocol === "bb84") {
        const data = await labApi.bb84({ num_bits: numBits, eve_enabled: eveEnabled, channel_error_rate: channelError, seed: seedValue });
        if (token === requestToken.current) setBb84(data);
      } else if (runProtocol === "e91") {
        const data = await labApi.e91({ num_pairs: numBits, eve_enabled: eveEnabled, channel_error_rate: channelError, seed: seedValue });
        if (token === requestToken.current) setE91(data);
      } else if (runProtocol === "b92") {
        const data = await labApi.b92({ num_bits: numBits, channel_error_rate: channelError, seed: seedValue });
        if (token === requestToken.current) setB92(data);
      } else {
        const data = await labApi.qrng({ num_bits: numBits, seed: seedValue });
        if (token === requestToken.current) setQrng(data);
      }
      if (token === requestToken.current) {
        setSnapshots((current) => ({ ...current, [runProtocol]: runSignature }));
        setVersions((current) => ({ ...current, [runProtocol]: (current[runProtocol] ?? 0) + 1 }));
        pushToast(`${runDefinition.name} observation is ready.`, "success");
      }
    } catch (runError) {
      if (token === requestToken.current) {
        const message = runError instanceof Error ? runError.message : "The protocol simulation failed.";
        setError(message);
        pushToast(`${runDefinition.name} could not run: ${message}`, "error");
      }
    } finally {
      if (token === requestToken.current) setBusy(false);
    }
  }

  const actions: RegisteredAction[] = [
    {
      id: "crypto.run-current",
      group: "Cryptography Lab",
      label: `Run ${definition.name} protocol`,
      hint: stale ? "Refresh the changed configuration" : "Simulate the current protocol controls",
      disabled: busy,
      run: () => { void run(); },
    },
    ...PROTOCOLS.map((item) => ({
      id: `crypto.protocol.${item.id}`,
      group: "Cryptography Lab",
      label: `Open ${item.name} protocol`,
      hint: item.shortLabel,
      disabled: protocol === item.id,
      run: () => changeProtocol(item.id),
    })),
    {
      id: "crypto.toggle-eve",
      group: "Cryptography Lab",
      label: eveEnabled ? "Disable Eve disturbance" : "Enable Eve disturbance",
      hint: "Available for BB84 and E91",
      disabled: busy || (protocol !== "bb84" && protocol !== "e91"),
      run: () => changeEve(!eveEnabled),
    },
  ];
  useRegisterActions("crypto-lab", actions);

  let resultContent = null;
  if (protocol === "bb84" && bb84) resultContent = <BB84Panel result={bb84} />;
  else if (protocol === "e91" && e91) resultContent = <E91Panel result={e91} />;
  else if (protocol === "b92" && b92) resultContent = <B92Panel result={b92} />;
  else if (protocol === "qrng" && qrng) resultContent = <QRNGPanel result={qrng} />;

  return (
    <div className="mx-auto max-w-[1880px] p-3 sm:p-5 lg:p-6 2xl:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="instrument-label text-accent-cyan">Quantum communication console</p>
          <h1 className="mt-1 font-display text-xl font-semibold tracking-[-0.02em] text-lab-text sm:text-2xl">Protocol analysis workspace</h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-lab-muted">Trace signal decisions, disturbance, sifting, and finite-sample evidence across four educational protocol models.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="cyan">Protocol-level simulation</Badge>
          <Badge tone="neutral">Never production-secure</Badge>
        </div>
      </header>

      <div className="mt-5">
        <ProtocolTabs protocol={protocol} onChange={changeProtocol} />
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section
          id="protocol-workspace"
          role="tabpanel"
          aria-labelledby={`protocol-tab-${protocol}`}
          aria-busy={busy}
          className="order-2 min-w-0 overflow-hidden rounded-xl border border-lab-border bg-lab-panel shadow-panel xl:order-1"
        >
          <div className={`border-b border-lab-border px-4 py-4 sm:px-5 ${styles.stageGrid}`}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="instrument-label">Live signal path</p>
                <h2 className="mt-1 font-display text-lg font-semibold text-lab-text">{definition.name} protocol observatory</h2>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-lab-muted">{definition.summary}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(protocol === "bb84" || protocol === "e91") && <Badge tone={eveEnabled ? "red" : "green"} dot>{eveEnabled ? "Eve in path" : "Direct channel"}</Badge>}
                {protocol !== "qrng" && <Badge tone={channelError >= 0.11 ? "amber" : "neutral"}>{(channelError * 100).toFixed(0)}% channel error</Badge>}
                <Badge tone={stale ? "amber" : hasResult ? "green" : "neutral"}>{stale ? "Result stale" : hasResult ? "Observed" : "Preview"}</Badge>
              </div>
            </div>
            <ProtocolFlow protocol={protocol} eveEnabled={eveEnabled} channelError={channelError} numBits={numBits} busy={busy} hasResult={hasResult} stale={stale} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-lab-border bg-[#080d13] px-4 py-2 text-[10px] leading-4 text-lab-faint sm:px-5">
            <span>Scope: reproducible educational statistics · no authenticated quantum network</span>
            <span className="font-mono">seed {seed === "" ? "random" : seed.toLocaleString()} · n={numBits.toLocaleString()}</span>
          </div>

          <p className="sr-only" aria-live="polite">{busy ? `Running ${definition.name}.` : error ? `${definition.name} failed.` : hasResult ? `${definition.name} result ready${stale ? ", but controls have changed" : ""}.` : `${definition.name} is ready to run.`}</p>

          {stale && (
            <div role="status" className="flex items-center justify-between gap-3 border-b border-accent-amber/25 bg-accent-amber/[.055] px-4 py-2.5 text-[11px] leading-4 text-amber-100 sm:px-5">
              <span>The controls changed after this observation. Values below remain visible for comparison but no longer match the signal path.</span>
              <Button size="sm" variant="quiet" className="shrink-0 text-amber-100 hover:text-white" onClick={() => void run()}>Refresh</Button>
            </div>
          )}

          {error && (
            <div className="border-b border-lab-border p-4 sm:p-5">
              <ErrorState title={`${definition.name} run failed`} message={error} action={<Button size="sm" variant="secondary" onClick={() => void run()}>Retry protocol</Button>} />
            </div>
          )}

          {busy && !hasResult ? <LoadingProtocolStage protocol={protocol} /> : null}
          {!busy && !hasResult && !error ? <EmptyProtocolStage protocol={protocol} onRun={() => void run()} /> : null}
          {hasResult && resultContent ? (
            <div key={`${protocol}-${versions[protocol] ?? 0}`} className={`${styles.resultReveal} ${stale ? "opacity-65" : ""}`}>
              {resultContent}
            </div>
          ) : null}
        </section>

        <div className="order-1 space-y-3 xl:order-2">
          <ProtocolControlPanel
            protocol={protocol}
            numBits={numBits}
            onNumBitsChange={changeNumBits}
            eveEnabled={eveEnabled}
            onEveChange={changeEve}
            channelError={channelError}
            onChannelErrorChange={changeChannelError}
            seed={seed}
            onSeedChange={changeSeed}
            busy={busy}
            stale={stale}
            hasResult={hasResult}
            onRun={() => void run()}
          />
          <ProtocolBrief protocol={protocol} hasResult={hasResult} stale={stale} seed={seed} />
        </div>
      </div>
    </div>
  );
}
