"use client";

// The workbench's primary navigation: a fixed vertical activity rail on
// desktop (icon + micro-label, active mode marked by a wire-node indicator on
// the rail edge) that becomes a fixed bottom tab bar on narrow screens. This
// replaces the old horizontal tab strip entirely.
import { CircuitIcon, FlaskIcon, ShieldIcon } from "@/components/ui/icons";
import type { Mode } from "./types";

const NAV_ITEMS: Array<{ mode: Mode; label: string; Icon: typeof CircuitIcon }> = [
  { mode: "composer", label: "Compose", Icon: CircuitIcon },
  { mode: "simulator", label: "Simulate", Icon: FlaskIcon },
  { mode: "crypto", label: "Crypto", Icon: ShieldIcon },
];

function RailButton({
  active,
  label,
  onClick,
  children,
  ariaLabel,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      aria-current={active ? "page" : undefined}
      className={`relative flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2.5 transition-colors ${
        active ? "text-accent-cyan" : "text-lab-faint hover:bg-lab-raised/60 hover:text-lab-muted"
      }`}
    >
      {active && (
        <span aria-hidden="true" className="absolute inset-y-2 right-0 w-px bg-gradient-to-b from-transparent via-accent-cyan to-transparent max-lg:hidden">
          <span className="absolute left-1/2 top-1/2 h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-cyan shadow-[0_0_6px_rgba(34,211,238,.9)]" />
        </span>
      )}
      {active && (
        <span aria-hidden="true" className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-accent-cyan to-transparent lg:hidden" />
      )}
      {children}
      <span className="font-display text-[9px] font-semibold uppercase tracking-[.12em]">{label}</span>
    </button>
  );
}

export function NavRail({
  mode,
  onModeChange,
  onOpenProjects,
  onOpenPalette,
}: {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onOpenProjects: () => void;
  onOpenPalette: () => void;
}) {
  return (
    <nav
      aria-label="Workbench"
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-lab-border bg-lab-bg/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:inset-y-0 lg:left-0 lg:right-auto lg:w-[76px] lg:flex-col lg:justify-start lg:gap-1 lg:border-r lg:border-t-0 lg:px-2 lg:py-3"
    >
      <a
        href="/composer"
        aria-label="Quantum Composer home"
        className="mb-2 hidden place-items-center rounded-lg border border-accent-cyan/35 bg-accent-cyan/[.08] py-2 font-mono text-[13px] font-semibold tracking-tight text-accent-cyan shadow-glow lg:grid"
      >
        |ψ⟩
      </a>

      {NAV_ITEMS.map(({ mode: itemMode, label, Icon }) => (
        <RailButton key={itemMode} active={mode === itemMode} label={label} onClick={() => onModeChange(itemMode)}>
          <Icon className="h-5 w-5" />
        </RailButton>
      ))}

      <div className="hidden flex-1 lg:block" />

      <RailButton label="Projects" ariaLabel="Open projects and recent circuits" onClick={onOpenProjects}>
        <span aria-hidden="true" className="grid h-5 w-5 place-items-center font-mono text-sm leading-none">▤</span>
      </RailButton>
      <RailButton label="⌘K" ariaLabel="Open command palette (Control K)" onClick={onOpenPalette}>
        <span aria-hidden="true" className="grid h-5 w-5 place-items-center font-mono text-sm leading-none">⌘</span>
      </RailButton>
    </nav>
  );
}
