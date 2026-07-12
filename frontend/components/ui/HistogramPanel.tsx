function truncateKey(key: string): string {
  if (key.length <= 20) return key;
  return `${key.slice(0, 12)}…${key.slice(-6)}`;
}

type CountEntry = [key: string, value: number];

function entryIsSmaller(left: CountEntry, right: CountEntry): boolean {
  return left[1] < right[1] || (left[1] === right[1] && left[0] > right[0]);
}

function siftUp(heap: CountEntry[], index: number): void {
  let cursor = index;
  while (cursor > 0) {
    const parent = Math.floor((cursor - 1) / 2);
    if (!entryIsSmaller(heap[cursor], heap[parent])) break;
    [heap[parent], heap[cursor]] = [heap[cursor], heap[parent]];
    cursor = parent;
  }
}

function siftDown(heap: CountEntry[], index: number): void {
  let cursor = index;
  while (true) {
    const left = cursor * 2 + 1;
    const right = left + 1;
    let smallest = cursor;
    if (left < heap.length && entryIsSmaller(heap[left], heap[smallest])) smallest = left;
    if (right < heap.length && entryIsSmaller(heap[right], heap[smallest])) smallest = right;
    if (smallest === cursor) return;
    [heap[cursor], heap[smallest]] = [heap[smallest], heap[cursor]];
    cursor = smallest;
  }
}

/**
 * Find the most frequent rows without materializing and sorting every outcome.
 * This is O(distinct outcomes × log(maxRows)) and retains only maxRows tuples.
 */
function summarizeCounts(counts: Record<string, number>, maxRows: number) {
  const limit = Math.max(0, Math.floor(maxRows));
  const heap: CountEntry[] = [];
  let total = 0;
  let distinctCount = 0;

  for (const key in counts) {
    if (!Object.prototype.hasOwnProperty.call(counts, key)) continue;
    const value = counts[key];
    total += value;
    distinctCount += 1;
    if (limit === 0) continue;
    const entry: CountEntry = [key, value];
    if (heap.length < limit) {
      heap.push(entry);
      siftUp(heap, heap.length - 1);
    } else if (entryIsSmaller(heap[0], entry)) {
      heap[0] = entry;
      siftDown(heap, 0);
    }
  }

  heap.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return { shown: heap, total, distinctCount };
}

export function HistogramPanel({ counts, maxRows = 20 }: { counts: Record<string, number>; maxRows?: number }) {
  const { shown, total: rawTotal, distinctCount } = summarizeCounts(counts, maxRows);
  if (distinctCount === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-lab-faint">No measurement outcomes were returned.</div>;
  }
  const total = rawTotal || 1;
  const max = shown[0]?.[1] || 1;
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
      {distinctCount > shown.length && (
        <p className="pt-1 text-[11px] text-lab-faint">+ {distinctCount - shown.length} more outcomes · {distinctCount} distinct states total</p>
      )}
    </div>
  );
}
