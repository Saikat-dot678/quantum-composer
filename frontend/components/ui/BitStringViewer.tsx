import { joinBits } from "@/lib/formatting";
import { CopyButton } from "./primitives";

export function BitStringViewer({
  bits,
  limit = 96,
  label,
  colorize = true,
  copyable = true,
}: {
  bits: number[];
  limit?: number;
  label?: string;
  colorize?: boolean;
  copyable?: boolean;
}) {
  const shown = bits.slice(0, limit);
  return (
    <div>
      {(label || copyable) && (
        <div className="mb-1.5 flex min-h-8 items-center justify-between gap-2">
          {label && <p className="instrument-label">{label}</p>}
          {copyable && bits.length > 0 && <CopyButton text={joinBits(bits)} label="Copy bits" />}
        </div>
      )}
      {bits.length === 0 ? (
        <p className="rounded-md border border-dashed border-lab-border px-3 py-2 text-xs text-lab-faint">No bits were retained in this run.</p>
      ) : (
        <div className="flex max-h-28 flex-wrap gap-0.5 overflow-auto rounded-md bg-lab-surface/50 p-2 font-mono text-[11px] leading-none">
          {shown.map((bit, index) => (
            <span key={index} className={`grid h-4 w-4 place-items-center rounded-sm ${colorize ? (bit ? "bg-accent-cyan/20 text-accent-cyan" : "bg-lab-raised text-lab-faint") : "bg-lab-raised text-lab-muted"}`}>
              {bit}
            </span>
          ))}
          {bits.length > shown.length && <span className="px-1 text-[10px] text-lab-faint">+{bits.length - shown.length}</span>}
        </div>
      )}
    </div>
  );
}
