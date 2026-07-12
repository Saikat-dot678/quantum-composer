const SCALE_MAX = 0.5;

export function QBERMeter({ qber, threshold = 0.11 }: { qber: number; threshold?: number }) {
  const clamped = Math.min(Math.max(qber, 0), SCALE_MAX);
  const pct = (clamped / SCALE_MAX) * 100;
  const thresholdPct = (threshold / SCALE_MAX) * 100;
  const tone = qber <= threshold ? "text-accent-green" : qber < 0.25 ? "text-accent-amber" : "text-accent-red";
  const fill = qber <= threshold ? "bg-accent-green" : qber < 0.25 ? "bg-accent-amber" : "bg-accent-red";

  return (
    <div role="meter" aria-label={`Quantum bit error rate ${(qber * 100).toFixed(1)} percent; educational threshold ${(threshold * 100).toFixed(0)} percent`} aria-valuemin={0} aria-valuemax={50} aria-valuenow={Math.min(50, qber * 100)}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="instrument-label">Quantum bit error rate</span>
        <span className={`font-mono text-sm font-semibold ${tone}`}>{(qber * 100).toFixed(1)}%</span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full">
        <div className="absolute inset-0 flex" aria-hidden="true">
          <div className="h-full bg-accent-green/30" style={{ width: `${thresholdPct}%` }} />
          <div className="h-full bg-accent-amber/30" style={{ width: `${(0.25 / SCALE_MAX) * 100 - thresholdPct}%` }} />
          <div className="h-full flex-1 bg-accent-red/30" />
        </div>
        <div className={`absolute inset-y-0 left-0 rounded-full ${fill}`} style={{ width: `${pct}%` }} aria-hidden="true" />
        <div className="absolute inset-y-0 w-0.5 bg-lab-text/70" style={{ left: `${thresholdPct}%` }} title={`Educational threshold ${(threshold * 100).toFixed(0)}%`} aria-hidden="true" />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-lab-faint" aria-hidden="true">
        <span>0%</span><span>threshold {(threshold * 100).toFixed(0)}%</span><span>≥50%</span>
      </div>
    </div>
  );
}
