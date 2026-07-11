// Measurement-outcome histogram as horizontal bars. Works for any key length
// (long bitstrings from large circuits are truncated), sorted by frequency.
function truncateKey(key: string): string {
  if (key.length <= 20) return key;
  return `${key.slice(0, 12)}…${key.slice(-6)}`;
}

export function HistogramPanel({ counts, maxRows = 20 }: { counts: Record<string, number>; maxRows?: number }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-lab-faint">Run a circuit to see measurement outcomes.</div>;
  }
  const total = entries.reduce((sum, [, v]) => sum + v, 0) || 1;
  const max = entries[0][1] || 1;
  const shown = entries.slice(0, maxRows);
  return (
    <div className="space-y-1.5">
      {shown.map(([key, value]) => (
        <div key={key} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate font-mono text-[11px] text-lab-muted" title={`${key} (${key.length} bits)`}>
            {truncateKey(key)}
          </span>
          <div className="relative h-4 flex-1 overflow-hidden rounded bg-lab-raised">
            <div className="h-full rounded bg-gradient-to-r from-accent-cyan/70 to-accent-cyan" style={{ width: `${(value / max) * 100}%` }} />
          </div>
          <span className="w-24 shrink-0 text-right font-mono text-[11px] text-lab-muted">
            {value} <span className="text-lab-faint">· {((value / total) * 100).toFixed(1)}%</span>
          </span>
        </div>
      ))}
      {entries.length > shown.length && (
        <p className="pt-1 text-[11px] text-lab-faint">+ {entries.length - shown.length} more outcome(s) · {entries.length} distinct states total</p>
      )}
    </div>
  );
}
