// Shared icon-shape renderer for custom gate definitions, usable both inside
// the circuit canvas's raw <svg> (already inside a <g transform>, so this
// emits bare shape primitives at an absolute cx/cy) and inside ordinary HTML
// contexts (GateDock chips, the library drawer, the Inspector) by wrapping
// the same primitive in a small standalone <svg>. One icon set, one visual
// mapping, everywhere a custom gate's glyph is shown.
import type { CustomGateIcon } from "@/lib/customGates";

function polygonPoints(cx: number, cy: number, radius: number, sides: number, rotationDeg = -90): string {
  const points: string[] = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = ((rotationDeg + (360 / sides) * i) * Math.PI) / 180;
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return points.join(" ");
}

function starPoints(cx: number, cy: number, outerRadius: number, innerRadius: number, points = 5): string {
  const coords: string[] = [];
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = ((-90 + (180 / points) * i) * Math.PI) / 180;
    coords.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return coords.join(" ");
}

/** A bare SVG shape primitive — valid directly inside any existing <svg>/<g>. */
export function CustomGateIconShape({
  icon,
  cx,
  cy,
  size,
  fill = "currentColor",
  stroke,
  strokeWidth,
}: {
  icon: CustomGateIcon;
  cx: number;
  cy: number;
  size: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}) {
  const shared = { fill, stroke, strokeWidth };
  switch (icon) {
    case "circle":
      return <circle cx={cx} cy={cy} r={size} {...shared} />;
    case "square":
      return <rect x={cx - size} y={cy - size} width={size * 2} height={size * 2} rx={size * 0.28} {...shared} />;
    case "diamond":
      return <polygon points={polygonPoints(cx, cy, size * 1.15, 4)} {...shared} />;
    case "hexagon":
      return <polygon points={polygonPoints(cx, cy, size * 1.05, 6, -30)} {...shared} />;
    case "triangle":
      return <polygon points={polygonPoints(cx, cy, size * 1.2, 3)} {...shared} />;
    case "star":
      return <polygon points={starPoints(cx, cy, size * 1.25, size * 0.5)} {...shared} />;
    default:
      return <circle cx={cx} cy={cy} r={size} {...shared} />;
  }
}

/** HTML-context wrapper (dock chips, drawer rows, inspector) — a small standalone <svg>. */
export function CustomGateGlyph({ icon, size = 18, className }: { icon: CustomGateIcon; size?: number; className?: string }) {
  const half = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className} aria-hidden="true">
      <CustomGateIconShape icon={icon} cx={half} cy={half} size={half * 0.62} />
    </svg>
  );
}
