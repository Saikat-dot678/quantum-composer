"use client";

import { useRef, useState } from "react";
import { Badge, Button, ErrorState, EmptyState, Panel, SectionHeader, Spinner, StatusNotice } from "@/components/ui/primitives";
import { labApi } from "@/lib/labApi";
import type { BB84Result, B92Result, E91Result, QRNGResult } from "@/lib/labTypes";
import { BB84Panel } from "./BB84Panel";
import { B92Panel } from "./B92Panel";
import { getProtocolDefinition, type Protocol } from "./config";
import { E91Panel } from "./E91Panel";
import { ProtocolBrief } from "./ProtocolBrief";
import { ProtocolControlPanel } from "./ProtocolControlPanel";
import { ProtocolFlow } from "./ProtocolFlow";
import { QRNGPanel } from "./QRNGPanel";

type SnapshotMap = Partial<Record<Protocol, string>>;

export function CryptographyLab() {
  const [protocol, setProtocol] = useState<Protocol>("bb84");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numBits, setNumBits] = useState(256);
  const [eveEnabled, setEveEnabled] = useState(false);
  const [channelError, setChannelError] = useState(0.02);
  const [seed, setSeed] = useState<number | "">(123);
  const [bb84, setBb84] = useState<BB84Result | null>(null);
  const [e91, setE91] = useState<E91Result | null>(null);
  const [b92, setB92] = useState<B92Result | null>(null);
  const [qrng, setQrng] = useState<QRNGResult | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotMap>({});
  const requestToken = useRef(0);

  const definition = getProtocolDefinition(protocol);
  const seedValue = seed === "" ? null : seed;
  const signature = JSON.stringify({ protocol, numBits, eveEnabled: protocol === "bb84" || protocol === "e91" ? eveEnabled : false, channelError: protocol === "qrng" ? 0 : channelError, seed: seedValue });
  const hasResult = protocol === "bb84" ? Boolean(bb84) : protocol === "e91" ? Boolean(e91) : protocol === "b92" ? Boolean(b92) : Boolean(qrng);
  const stale = hasResult && snapshots[protocol] !== signature;

  function invalidatePending() {
    requestToken.current += 1;
    setBusy(false);
    setError(null);
  }

  function changeProtocol(next: Protocol) {
    invalidatePending();
    setProtocol(next);
    if (next === "qrng") setNumBits((value) => Math.min(8192, value));
    else setNumBits((value) => Math.min(4096, value));
  }

  async function run() {
    const token = ++requestToken.current;
    const runProtocol = protocol;
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
      if (token === requestToken.current) setSnapshots((current) => ({ ...current, [runProtocol]: runSignature }));
    } catch (runError) {
      if (token === requestToken.current) setError(runError instanceof Error ? runError.message : "The protocol simulation failed.");
    } finally {
      if (token === requestToken.current) setBusy(false);
    }
  }

  const updateNumber = (setter: (value: number) => void) => (value: number) => { invalidatePending(); setter(value); };

  return (
    <div className="mx-auto grid max-w-[1840px] gap-5 p-4 sm:p-5 xl:grid-cols-[290px_minmax(0,1fr)] xl:p-6 2xl:grid-cols-[290px_minmax(0,1fr)_310px] 2xl:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3 xl:col-span-2 2xl:col-span-3">
        <div>
          <p className="instrument-label text-accent-cyan">Cryptography Lab</p>
          <h1 className="mt-1 font-display text-xl font-semibold tracking-[-0.01em] text-lab-text sm:text-2xl">Protocol analysis workspace</h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-lab-muted">Trace Alice, Bob, and Eve through reproducible educational models; inspect sifting, disturbance, correlations, and finite-sample statistics.</p>
        </div>
        <div className="flex flex-wrap gap-2"><Badge tone="cyan">Protocol-level models</Badge><Badge tone="neutral">No production keys</Badge></div>
      </div>
      <ProtocolControlPanel
        protocol={protocol}
        onProtocolChange={changeProtocol}
        numBits={numBits}
        onNumBitsChange={updateNumber(setNumBits)}
        eveEnabled={eveEnabled}
        onEveChange={(value) => { invalidatePending(); setEveEnabled(value); }}
        channelError={channelError}
        onChannelErrorChange={updateNumber(setChannelError)}
        seed={seed}
        onSeedChange={(value) => { invalidatePending(); setSeed(value); }}
        busy={busy}
        onRun={run}
      />

      <section id="protocol-workspace" role="tabpanel" className="min-w-0 space-y-4">
        <Panel className="p-4 sm:p-5">
          <SectionHeader eyebrow="Protocol signal path" title={`${definition.name} experiment`} description={definition.summary} />
          <ProtocolFlow protocol={protocol} eveEnabled={eveEnabled} />
        </Panel>

        <StatusNotice kind="info">Educational protocol simulation only. These models do not simulate a production quantum network, certify devices, or generate deployable cryptographic material.</StatusNotice>
        {busy && <Panel className="p-4"><Spinner label={`Running ${definition.name} protocol…`} /></Panel>}
        {error && <ErrorState title={`${definition.name} run failed`} message={error} action={<Button size="sm" variant="secondary" onClick={() => void run()}>Retry protocol</Button>} />}
        {stale && <StatusNotice kind="info">Parameters changed after this result was produced. Run again to refresh the analysis.</StatusNotice>}

        {protocol === "bb84" && bb84 && <BB84Panel result={bb84} />}
        {protocol === "e91" && e91 && <E91Panel result={e91} />}
        {protocol === "b92" && b92 && <B92Panel result={b92} />}
        {protocol === "qrng" && qrng && <QRNGPanel result={qrng} />}

        {!hasResult && !busy && !error && <EmptyState title={`Ready to run ${definition.name}`} description="Adjust the parameters, then run the protocol to inspect its flow, statistics, key material, and educational security notes." />}
      </section>

      <ProtocolBrief protocol={protocol} hasResult={hasResult} stale={stale} seed={seed} />
    </div>
  );
}
