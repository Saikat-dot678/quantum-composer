"use client";

// Route-level error boundary: an unexpected client error lands here instead of
// a blank page. Honest copy, a recovery action, and no stack traces for users.
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg px-5 py-20 text-center">
      <p className="instrument-label text-accent-red">Workspace error</p>
      <h1 className="mt-2 font-display text-xl font-semibold text-lab-text">Something failed in this view</h1>
      <p className="mt-2 text-sm leading-6 text-lab-muted">
        The rest of the workbench is unaffected. You can retry this view; if the problem repeats,
        reload the page — your circuit is autosaved locally.
      </p>
      {error.digest && <p className="mt-2 font-mono text-[11px] text-lab-faint">ref {error.digest}</p>}
      <button
        type="button"
        onClick={reset}
        className="mt-5 inline-flex min-h-10 items-center rounded-lg border border-accent-cyan bg-accent-cyan px-4 py-2 text-sm font-semibold text-[#031014] transition hover:bg-cyan-300"
      >
        Retry this view
      </button>
    </div>
  );
}
