"use client";

// Interactive Bloch sphere: an orthographic 3-D projection rendered as plain
// SVG (no visualization dependency), rotatable by pointer drag or arrow keys.
// Shows the axes, equator/meridian guides, and the live state vector for a
// single qubit. Loaded lazily by the state preview panel.
import { useCallback, useRef, useState } from "react";

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const RADIUS = 74;
const CENTER = 92;
const SAMPLES = 48;

function rotate(point: Vec3, yaw: number, pitch: number): Vec3 {
  // Yaw about the vertical (z) axis, then pitch about the screen-horizontal axis.
  const x1 = point.x * Math.cos(yaw) - point.y * Math.sin(yaw);
  const y1 = point.x * Math.sin(yaw) + point.y * Math.cos(yaw);
  const z1 = point.z;
  const y2 = y1 * Math.cos(pitch) - z1 * Math.sin(pitch);
  const z2 = y1 * Math.sin(pitch) + z1 * Math.cos(pitch);
  return { x: x1, y: y2, z: z2 };
}

function toScreen(point: Vec3): { sx: number; sy: number; depth: number } {
  return { sx: CENTER + point.x * RADIUS, sy: CENTER - point.z * RADIUS, depth: point.y };
}

function circlePath(plane: "equator" | "meridian", yaw: number, pitch: number): string {
  const segments: string[] = [];
  for (let index = 0; index <= SAMPLES; index += 1) {
    const angle = (index / SAMPLES) * Math.PI * 2;
    const point: Vec3 = plane === "equator"
      ? { x: Math.cos(angle), y: Math.sin(angle), z: 0 }
      : { x: Math.sin(angle), y: 0, z: Math.cos(angle) };
    const { sx, sy } = toScreen(rotate(point, yaw, pitch));
    segments.push(`${index === 0 ? "M" : "L"}${sx.toFixed(1)} ${sy.toFixed(1)}`);
  }
  return segments.join(" ");
}

function AxisLine({ to, label, yaw, pitch }: { to: Vec3; label: string; yaw: number; pitch: number }) {
  const tip = toScreen(rotate(to, yaw, pitch));
  const origin = { sx: CENTER, sy: CENTER };
  const labelPoint = toScreen(rotate({ x: to.x * 1.18, y: to.y * 1.18, z: to.z * 1.18 }, yaw, pitch));
  const behind = tip.depth < 0;
  return (
    <g aria-hidden="true">
      <line x1={origin.sx} y1={origin.sy} x2={tip.sx} y2={tip.sy} stroke="#2a3c4e" strokeWidth={behind ? 0.8 : 1.2} strokeDasharray={behind ? "3 3" : undefined} />
      <text x={labelPoint.sx} y={labelPoint.sy} textAnchor="middle" dominantBaseline="middle" fill={behind ? "#5d7085" : "#7d90a4"} fontSize="9" fontFamily="monospace">{label}</text>
    </g>
  );
}

export function BlochSphere3D({ x, y, z }: { x: number; y: number; z: number }) {
  const [yaw, setYaw] = useState(-0.5);
  const [pitch, setPitch] = useState(-0.35);
  const dragging = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);

  const onPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    dragging.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragging.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setYaw((value) => value + (event.clientX - drag.lastX) * 0.012);
    setPitch((value) => Math.max(-1.45, Math.min(1.45, value + (event.clientY - drag.lastY) * 0.012)));
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
  }, []);

  const onPointerUp = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (dragging.current?.pointerId === event.pointerId) dragging.current = null;
  }, []);

  const vector = toScreen(rotate({ x, y, z }, yaw, pitch));
  const vectorInFront = vector.depth >= 0;
  const zeroLabel = toScreen(rotate({ x: 0, y: 0, z: 1.32 }, yaw, pitch));
  const oneLabel = toScreen(rotate({ x: 0, y: 0, z: -1.32 }, yaw, pitch));

  return (
    <figure className="m-0">
      <svg
        viewBox="0 0 184 184"
        className="h-44 w-44 max-w-full cursor-grab touch-none select-none active:cursor-grabbing"
        role="img"
        aria-label={`Bloch sphere. State vector at x ${x.toFixed(2)}, y ${y.toFixed(2)}, z ${z.toFixed(2)}. Drag or use arrow keys to rotate.`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(event) => {
          const step = 0.14;
          if (event.key === "ArrowLeft") { event.preventDefault(); setYaw((value) => value - step); }
          else if (event.key === "ArrowRight") { event.preventDefault(); setYaw((value) => value + step); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setPitch((value) => Math.max(-1.45, value - step)); }
          else if (event.key === "ArrowDown") { event.preventDefault(); setPitch((value) => Math.min(1.45, value + step)); }
        }}
      >
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="rgba(34,211,238,0.03)" stroke="#2a3c4e" strokeWidth="1" />
        <path d={circlePath("equator", yaw, pitch)} fill="none" stroke="#1f2c3d" strokeWidth="1" />
        <path d={circlePath("meridian", yaw, pitch)} fill="none" stroke="#1f2c3d" strokeWidth="1" />
        <AxisLine to={{ x: 1, y: 0, z: 0 }} label="X" yaw={yaw} pitch={pitch} />
        <AxisLine to={{ x: 0, y: 1, z: 0 }} label="Y" yaw={yaw} pitch={pitch} />
        <AxisLine to={{ x: 0, y: 0, z: 1 }} label="Z" yaw={yaw} pitch={pitch} />
        <text x={zeroLabel.sx} y={zeroLabel.sy} textAnchor="middle" fill="#7d90a4" fontSize="9" fontFamily="monospace" aria-hidden="true">|0⟩</text>
        <text x={oneLabel.sx} y={oneLabel.sy} textAnchor="middle" fill="#7d90a4" fontSize="9" fontFamily="monospace" aria-hidden="true">|1⟩</text>
        <line
          x1={CENTER}
          y1={CENTER}
          x2={vector.sx}
          y2={vector.sy}
          stroke="#22d3ee"
          strokeWidth={vectorInFront ? 2 : 1.4}
          strokeOpacity={vectorInFront ? 1 : 0.55}
          strokeLinecap="round"
        />
        <circle cx={vector.sx} cy={vector.sy} r={vectorInFront ? 3.4 : 2.6} fill="#22d3ee" fillOpacity={vectorInFront ? 1 : 0.6} />
      </svg>
      <figcaption className="mt-1 text-[10px] text-lab-faint">Drag (or focus + arrow keys) to rotate the camera.</figcaption>
    </figure>
  );
}

export default BlochSphere3D;
