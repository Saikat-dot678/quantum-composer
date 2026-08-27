export default function Loading() {
  return (
    <div className="flex min-h-[calc(100vh-56px)] items-center justify-center bg-canvas px-6">
      <div role="status" aria-live="polite" className="w-full max-w-sm rounded-xl2 border border-line bg-surface p-5 text-center shadow-island">
        <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl border border-accent-100 bg-accent-50 font-mono text-sm font-semibold text-accent-600" aria-hidden="true">|ψ⟩</span>
        <p className="mt-3 text-sm font-semibold text-ink-900">Preparing quantum workspace</p>
        <p className="mt-1 text-xs leading-5 text-ink-400">Loading the circuit editor and local project state…</p>
        <div className="mx-auto mt-4 h-1 w-28 overflow-hidden rounded-full bg-ink-100" aria-hidden="true">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-accent-500" />
        </div>
      </div>
    </div>
  );
}
