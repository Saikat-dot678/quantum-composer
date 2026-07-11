// Renders a bit array (0/1) as a compact monospace chip row, truncated with a
// "+N more" tail so large keys never blow up the layout.
export function BitStringViewer({
  bits,
  limit = 96,
  label,
  colorize = true,
}: {
  bits: number[];
  limit?: number;
  label?: string;
  colorize?: boolean;
}) {
  const shown = bits.slice(0, limit);
  return (
    <div>
      {label && <p className="mb-1 text-[10px] uppercase tracking-wider text-lab-faint">{label}</p>}
      <div className="flex flex-wrap gap-0.5 font-mono text-[10px] leading-none">
        {shown.map((b, i) => (
          <span
            key={i}
            className={`grid h-4 w-4 place-items-center rounded-sm ${
              colorize ? (b ? "bg-accent-cyan/20 text-accent-cyan" : "bg-lab-raised text-lab-faint") : "bg-lab-raised text-lab-muted"
            }`}
          >
            {b}
          </span>
        ))}
        {bits.length > shown.length && <span className="px-1 text-[10px] text-lab-faint">+{bits.length - shown.length}</span>}
      </div>
    </div>
  );
}
