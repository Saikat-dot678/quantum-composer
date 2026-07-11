"use client";
import { useState, type ReactNode } from "react";

// --- Panel / card ---------------------------------------------------------

export function Panel({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "aside";
}) {
  return (
    <Tag className={`rounded-2xl border border-lab-border bg-lab-panel shadow-panel ${className}`}>
      {children}
    </Tag>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  right,
}: {
  eyebrow?: string;
  title: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-accent-cyan/80">{eyebrow}</p>}
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-lab-text">{title}</h2>
      </div>
      {right}
    </div>
  );
}

// --- Stat tile ------------------------------------------------------------

const TONES: Record<string, string> = {
  slate: "text-lab-text",
  cyan: "text-accent-cyan",
  green: "text-accent-green",
  amber: "text-accent-amber",
  red: "text-accent-red",
  violet: "text-quantum-400",
};

export function StatTile({ label, value, tone = "slate", hint }: { label: string; value: ReactNode; tone?: keyof typeof TONES | string; hint?: string }) {
  return (
    <div className="rounded-xl border border-lab-border bg-lab-raised/60 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-lab-faint">{label}</p>
      <p className={`font-mono text-sm font-semibold ${TONES[tone] ?? "text-lab-text"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[10px] leading-3 text-lab-faint">{hint}</p>}
    </div>
  );
}

// --- Badge ----------------------------------------------------------------

export type BadgeTone = "cyan" | "green" | "amber" | "red" | "violet" | "neutral";

const BADGE_TONES: Record<BadgeTone, string> = {
  cyan: "border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan",
  green: "border-accent-green/40 bg-accent-green/10 text-accent-green",
  amber: "border-accent-amber/40 bg-accent-amber/10 text-accent-amber",
  red: "border-accent-red/40 bg-accent-red/10 text-accent-red",
  violet: "border-quantum-400/40 bg-quantum-400/10 text-quantum-400",
  neutral: "border-lab-borderStrong bg-lab-raised text-lab-muted",
};

export function Badge({ tone = "neutral", children, title }: { tone?: BadgeTone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

// --- Callouts -------------------------------------------------------------

export function EducationalCallout({ children, icon = "ⓘ" }: { children: ReactNode; icon?: string }) {
  return (
    <div className="flex gap-2.5 rounded-xl border border-accent-cyan/25 bg-accent-cyan/[.06] px-4 py-3 text-[12px] leading-5 text-cyan-100/90">
      <span className="mt-0.5 shrink-0 text-accent-cyan">{icon}</span>
      <div>{children}</div>
    </div>
  );
}

export function WarningCallout({ children, tone = "amber" }: { children: ReactNode; tone?: "amber" | "red" }) {
  const cls = tone === "red"
    ? "border-accent-red/30 bg-accent-red/[.07] text-red-200"
    : "border-accent-amber/30 bg-accent-amber/[.07] text-amber-100";
  return <div className={`rounded-lg border px-3 py-2 text-[12px] leading-5 ${cls}`}>{children}</div>;
}

// --- Copy button + code block --------------------------------------------

export function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard?.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className={`text-[11px] font-medium text-accent-cyan hover:text-cyan-300 ${className}`}
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-sm text-lab-muted">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-lab-borderStrong border-t-accent-cyan" />
      {label}
    </div>
  );
}
