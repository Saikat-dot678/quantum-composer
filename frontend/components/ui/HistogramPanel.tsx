function truncateKey(key: string): string {
  if (key.length <= 20) return key;
  return `${key.slice(0, 12)}…${key.slice(-6)}`;
}

export function HistogramPanel({ counts, maxRows = 20 }: { counts: Record<string, number>; maxRows?: number }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-lab-faint">No measurement outcomes were returned.</div>;
  }
  const total = entries.reduce((sum, [, value]) => sum + value, 0) || 1;
  const max = entries[0][1] || 1;
  const shown = entries.slice(0, maxRows);
  return (
    <div className="space-y-2" role="list" aria-label="Measurement outcomes">
      {shown.map(([key, value]) => (
        <div key={key} role="listitem" className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 sm:grid-cols-[minmax(5rem,10rem)_minmax(5rem,1fr)_6.5rem] sm:items-center">
          <span className="truncate font-mono text-xs text-lab-muted" title={`${key} (${key.length} bits)`}>{truncateKey(key)}</span>
          <span className="text-right font-mono text-[11px] text-lab-muted sm:order-3">
            {value.toLocaleString()} <span className="text-lab-faint">· {((value / total) * 100).toFixed(1)}%</span>
          </span>
          <div className="relative col-span-2 h-3 overflow-hidden rounded-sm bg-lab-raised sm:col-span-1 sm:order-2" role="meter" aria-label={`${key}: ${value} shots`} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
            <div className="h-full rounded-sm bg-accent-cyan" style={{ width: `${(value / max) * 100}%` }} />
          </div>
        </div>
      ))}
      {entries.length > shown.length && (
        <p className="pt-1 text-[11px] text-lab-faint">+ {entries.length - shown.length} more outcomes · {entries.length} distinct states total</p>
      )}
    </div>
  );
}
