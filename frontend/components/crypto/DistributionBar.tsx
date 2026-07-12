export interface DistributionSegment {
  label: string;
  value: number;
  className: string;
}

export function DistributionBar({ label, segments }: { label: string; segments: DistributionSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  return (
    <div role="img" aria-label={`${label}: ${segments.map((segment) => `${segment.label} ${segment.value}`).join(", ")}`}>
      <div className="flex h-7 overflow-hidden rounded-md border border-lab-border bg-lab-raised">
        {segments.map((segment) => {
          const percent = (segment.value / total) * 100;
          return (
            <div key={segment.label} className={`flex min-w-0 items-center justify-center overflow-hidden px-1 font-mono text-[10px] font-semibold ${segment.className}`} style={{ width: `${percent}%` }} title={`${segment.label}: ${segment.value} (${percent.toFixed(1)}%)`}>
              {percent >= 12 ? `${segment.label} ${segment.value}` : ""}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-lab-faint">
        {segments.map((segment) => <span key={segment.label}>{segment.label}: <b className="font-mono font-medium text-lab-muted">{segment.value}</b></span>)}
      </div>
    </div>
  );
}
