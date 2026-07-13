"use client";

// Replaces the old row-of-stage-cards with an actual actor/channel diagram
// (reference study #9 IBM Composer, #7 React Flow node/edge model, adapted to
// a fixed two- or three-node topology instead of a free-form graph): BB84 and
// B92 are prepare-and-measure protocols, drawn as Alice -> channel -> Bob with
// an optional Eve tap sitting on the wire; E91 is drawn as its actual physical
// topology, a shared source emitting to two independent analyzers; QRNG has no
// second party at all, so it gets its own single-pipeline layout instead of an
// empty Bob box. A traveling dot animates along the channel while a run is in
// flight (paused under prefers-reduced-motion via cryptoLab.module.css).
import type { CSSProperties } from "react";
import { getProtocolDefinition, type Protocol } from "./config";
import styles from "./cryptoLab.module.css";

interface ProtocolDiagramProps {
  protocol: Protocol;
  eveEnabled: boolean;
  channelError: number;
  numBits: number;
  busy: boolean;
  hasResult: boolean;
  stale: boolean;
}

const W = 640;
const H = 176;
const MID_Y = 92;

function ActorBox({ x, y, w, h, label, sublabel, tone }: { x: number; y: number; w: number; h: number; label: string; sublabel: string; tone: "accent" | "quantum" }) {
  const stroke = tone === "accent" ? "#4338ca" : "#6d28d9";
  const bg = tone === "accent" ? "#eef2ff" : "#f5f3ff";
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill={bg} stroke={stroke} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + h / 2 - 6} textAnchor="middle" fontFamily="var(--font-ui)" fontSize={13} fontWeight={700} fill="#18181b">{label}</text>
      <text x={x + w / 2} y={y + h / 2 + 12} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={9} fill="#63636c">{sublabel}</text>
    </g>
  );
}

function EveTap({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y - 34} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="3 2" />
      <rect x={x - 34} y={y - 66} width={68} height={32} rx={8} fill="#fef2f2" stroke="#dc2626" strokeWidth={1.5} />
      <text x={x} y={y - 48} textAnchor="middle" fontFamily="var(--font-ui)" fontSize={11} fontWeight={700} fill="#b91c1c">Eve</text>
      <text x={x} y={y - 36} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={8} fill="#b91c1c">intercept</text>
      <circle cx={x} cy={y} r={3} fill="#dc2626" />
    </g>
  );
}

function Channel({ x1, x2, y, alert, busy, label }: { x1: number; x2: number; y: number; alert: boolean; busy: boolean; label: string }) {
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={alert ? "#dc2626" : "#a5a6f6"} strokeWidth={2} strokeDasharray={alert ? "5 3" : undefined} opacity={alert ? 0.8 : 0.9} />
      <text x={(x1 + x2) / 2} y={y - 8} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={9} fill="#63636c">{label}</text>
      {busy && (
        <circle r={4} fill={alert ? "#dc2626" : "#4f46e5"} cy={y} cx={x1} className={`${styles.photon} ${alert ? styles.photonAlert : ""}`} style={{ "--photon-distance": `${x2 - x1}px` } as CSSProperties} />
      )}
    </g>
  );
}

export function ProtocolDiagram({ protocol, eveEnabled, channelError, numBits, busy, hasResult, stale }: ProtocolDiagramProps) {
  const definition = getProtocolDefinition(protocol);
  const errorPct = `${(channelError * 100).toFixed(channelError < 0.01 ? 1 : 0)}% error`;
  const countLabel = `${numBits.toLocaleString()} ${protocol === "e91" ? "pairs" : "bits"}`;
  const eveActive = eveEnabled && (protocol === "bb84" || protocol === "e91");
  const resultTone = !hasResult ? "#71717a" : stale ? "#92400e" : "#047857";
  const resultLabel = !hasResult ? "awaiting observation" : stale ? "stale — refresh" : "current observation";

  if (protocol === "qrng") {
    const boxW = 90;
    const stageX = [20, 190, 360, 530];
    return (
      <div className={`overflow-x-auto pb-1 ${styles.stageGrid} rounded-lg`}>
        <svg viewBox={`0 0 ${W} 150`} role="img" aria-label={`${definition.name} pipeline: prepare a qubit, apply Hadamard, measure, then audit the bit distribution.`} className="h-auto min-w-[560px] w-full">
          <ActorBox x={stageX[0]} y={40} w={boxW} h={64} label="|0⟩" sublabel="prepared" tone="accent" />
          <ActorBox x={stageX[1]} y={40} w={boxW} h={64} label="H" sublabel="superposition" tone="quantum" />
          <ActorBox x={stageX[2]} y={40} w={boxW} h={64} label="Measure" sublabel="Z basis" tone="accent" />
          <ActorBox x={stageX[3]} y={40} w={boxW} h={64} label="Bits" sublabel="output stream" tone="quantum" />
          {[0, 1, 2].map((index) => (
            <Channel key={index} x1={stageX[index] + boxW} x2={stageX[index + 1]} y={72} alert={false} busy={busy} label={index === 0 ? countLabel : ""} />
          ))}
          <circle cx={stageX[3] + boxW / 2} cy={118} r={4} fill={resultTone} />
          <text x={stageX[3] + boxW / 2} y={136} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={9} fill={resultTone}>{resultLabel}</text>
        </svg>
      </div>
    );
  }

  if (protocol === "e91") {
    const sourceX = W / 2 - 46;
    const aliceX = 24;
    const bobX = W - 24 - 96;
    return (
      <div className={`overflow-x-auto pb-1 ${styles.stageGrid} rounded-lg`}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${definition.name}: a shared source emits entangled pairs to Alice and Bob${eveActive ? ", with Eve modeled on Bob's analyzer" : ""}.`} className="h-auto min-w-[560px] w-full">
          <ActorBox x={aliceX} y={MID_Y - 32} w={96} h={64} label="Alice" sublabel="analyzer α" tone="accent" />
          <ActorBox x={sourceX} y={MID_Y - 32} w={92} h={64} label="Source" sublabel="singlet pairs" tone="quantum" />
          <ActorBox x={bobX} y={MID_Y - 32} w={96} h={64} label="Bob" sublabel="analyzer β" tone="accent" />
          <Channel x1={aliceX + 96} x2={sourceX} y={MID_Y} alert={false} busy={busy} label={countLabel} />
          <Channel x1={sourceX + 92} x2={bobX} y={MID_Y} alert={eveActive} busy={busy} label={eveActive ? "" : errorPct} />
          {eveActive && <EveTap x={(sourceX + 92 + bobX) / 2} y={MID_Y} />}
          <circle cx={bobX + 96 - 8} cy={MID_Y - 32 + 8} r={4} fill={resultTone} stroke="#ffffff" strokeWidth={1.5} />
          <text x={W - 4} y={H - 10} textAnchor="end" fontFamily="var(--font-mono)" fontSize={9} fill={resultTone}>{resultLabel}</text>
        </svg>
      </div>
    );
  }

  // bb84 / b92: linear Alice -> [Eve] -> Bob.
  const aliceX = 24;
  const bobX = W - 24 - 100;
  const midX = W / 2 - 20;
  return (
    <div className={`overflow-x-auto pb-1 ${styles.stageGrid} rounded-lg`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${definition.name}: Alice prepares states, sends them across a channel${eveActive ? " intercepted by Eve" : ""}, and Bob measures.`} className="h-auto min-w-[520px] w-full">
        <ActorBox x={aliceX} y={MID_Y - 32} w={100} h={64} label="Alice" sublabel={definition.steps[0]} tone="accent" />
        <ActorBox x={bobX} y={MID_Y - 32} w={100} h={64} label="Bob" sublabel={definition.steps[2] ?? "measure"} tone="accent" />
        {eveActive ? (
          <>
            <Channel x1={aliceX + 100} x2={midX} y={MID_Y} alert busy={busy} label="" />
            <Channel x1={midX} x2={bobX} y={MID_Y} alert busy={busy} label="" />
            <EveTap x={midX} y={MID_Y} />
            <text x={midX} y={MID_Y + 24} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={9} fill="#b91c1c">intercept + resend</text>
          </>
        ) : (
          <Channel x1={aliceX + 100} x2={bobX} y={MID_Y} alert={channelError >= 0.11} busy={busy} label={`${countLabel} · ${errorPct}`} />
        )}
        <circle cx={bobX + 100 - 8} cy={MID_Y - 32 + 8} r={4} fill={resultTone} stroke="#ffffff" strokeWidth={1.5} />
        <text x={W - 4} y={H - 10} textAnchor="end" fontFamily="var(--font-mono)" fontSize={9} fill={resultTone}>{resultLabel}</text>
        <text x={4} y={H - 10} fontFamily="var(--font-mono)" fontSize={9} fill="#63636c">{definition.steps.join(" → ")}</text>
      </svg>
    </div>
  );
}
