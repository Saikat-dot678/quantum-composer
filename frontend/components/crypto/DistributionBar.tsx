export interface DistributionSegment {
  label: string;
  value: number;
  className: string;
}

export function DistributionBar({ label, segments, idealPercent }: { label: string; segments: DistributionSegment[]; idealPercent?: number }) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0) || 1;
  return (
    <div role="img" aria-label={`${label}: ${segments.map((segment) => `${segment.label} ${segment.value}`).join(", ")}${idealPercent == null ? "" : `; ideal marker ${idealPercent} percent`}`}>
      <div className="relative flex h-8 overflow-hidden rounded-lg border border-lab-border bg-lab-raised">
        {segments.map((segment) => {
          const percent = (Math.max(0, segment.value) / total) * 100;
          return (
            <div key={segment.label} className={`flex min-w-0 items-center justify-center overflow-hidden px-1 font-mono text-[9px] font-semibold transition-[width] duration-300 motion-reduce:transition-none ${segment.className}`} style={{ width: `${percent}%` }} title={`${segment.label}: ${segment.value.toLocaleString()} (${percent.toFixed(1)}%)`}>
              {percent >= 14 ? segment.label : ""}
            </div>
          );
        })}
        {idealPercent != null && <span className="pointer-events-none absolute inset-y-0 w-px border-l border-dashed border-white/70" style={{ left: `${Math.max(0, Math.min(100, idealPercent))}%` }} title={`Ideal ${idealPercent}%`} />}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-lab-faint">
        {segments.map((segment) => <span key={segment.label}>{segment.label}: <b className="font-mono font-medium text-lab-muted">{segment.value.toLocaleString()}</b></span>)}
      </div>
    </div>
  );
}
