// A QBER meter with green / amber / red zones and the security threshold marked.
// `qber` and `threshold` are fractions (0..1). The scale caps at 50%.
const SCALE_MAX = 0.5;

export function QBERMeter({ qber, threshold = 0.11 }: { qber: number; threshold?: number }) {
  const clamped = Math.min(Math.max(qber, 0), SCALE_MAX);
  const pct = (clamped / SCALE_MAX) * 100;
  const thresholdPct = (threshold / SCALE_MAX) * 100;
  const tone = qber <= threshold ? "text-accent-green" : qber < 0.25 ? "text-accent-amber" : "text-accent-red";

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider text-lab-faint">Quantum Bit Error Rate</span>
        <span className={`font-mono text-sm font-semibold ${tone}`}>{(qber * 100).toFixed(1)}%</span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full">
        {/* zone bands */}
        <div className="absolute inset-0 flex">
          <div className="h-full bg-accent-green/30" style={{ width: `${thresholdPct}%` }} />
          <div className="h-full bg-accent-amber/30" style={{ width: `${(0.25 / SCALE_MAX) * 100 - thresholdPct}%` }} />
          <div className="h-full flex-1 bg-accent-red/30" />
        </div>
        {/* fill */}
        <div className={`absolute inset-y-0 left-0 rounded-full ${qber <= threshold ? "bg-accent-green" : qber < 0.25 ? "bg-accent-amber" : "bg-accent-red"}`} style={{ width: `${pct}%` }} />
        {/* threshold marker */}
        <div className="absolute inset-y-0 w-0.5 bg-lab-text/70" style={{ left: `${thresholdPct}%` }} title={`Security threshold ${(threshold * 100).toFixed(0)}%`} />
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-lab-faint">
        <span>0%</span>
        <span>threshold {(threshold * 100).toFixed(0)}%</span>
        <span>≥50%</span>
      </div>
    </div>
  );
}
