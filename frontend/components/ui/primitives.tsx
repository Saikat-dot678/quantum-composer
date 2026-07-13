"use client";

import {
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { AlertIcon, CheckIcon, CopyIcon, InfoIcon } from "./icons";

// Shared vocabulary for the "Instrument Canvas" system (see
// docs/FRONTEND_REFERENCE_STUDY.md). Every export here keeps its previous
// name and prop shape on purpose: dozens of Simulator Lab / Cryptography Lab /
// output-panel components consume these primitives, and re-skinning this one
// file propagates the new light/neutral/indigo visual system to all of them
// without touching each call site. Legacy tone keys (`cyan`/`green`/`amber`/
// `red`/`violet`) are kept and re-mapped onto the new semantic palette
// (accent/safe/warn/danger/quantum) so no caller needs to change.

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function Panel({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "aside" | "article";
}) {
  return (
    <Tag className={cx("rounded-xl2 border border-line bg-surface shadow-island", className)}>
      {children}
    </Tag>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  right,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow text-accent-600">{eyebrow}</p>}
        <h2 className={cx("font-display text-lg font-semibold tracking-[-0.01em] text-ink-900", eyebrow && "mt-1")}>{title}</h2>
        {description && <div className="mt-1 max-w-2xl text-xs leading-5 text-ink-500">{description}</div>}
      </div>
      {right}
    </div>
  );
}

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "border-accent-600 bg-accent-600 text-white shadow-sm hover:bg-accent-700",
  secondary: "border-line-strong bg-surface text-ink-900 hover:border-accent-500 hover:text-accent-700",
  quiet: "border-transparent bg-transparent text-ink-500 hover:bg-ink-100 hover:text-ink-900",
  danger: "border-danger-border bg-danger-bg text-danger-text hover:bg-red-100",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" ? "min-h-8 px-3 py-1.5 text-xs" : "min-h-10 px-4 py-2 text-sm",
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />}
      {children}
    </button>
  );
}

const TONES = {
  slate: "text-ink-900",
  cyan: "text-accent-600",
  green: "text-safe-text",
  amber: "text-warn-text",
  red: "text-danger-text",
  violet: "text-quantum-text",
} as const;

export function StatTile({
  label,
  value,
  tone = "slate",
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: keyof typeof TONES | string;
  hint?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-line-hairline bg-surface-sunken px-3 py-2.5">
      <p className="eyebrow truncate">{label}</p>
      <p className={cx("mt-1 truncate font-mono text-sm font-semibold", TONES[tone as keyof typeof TONES] ?? "text-ink-900")}>{value}</p>
      {hint && <p className="mt-1 text-[11px] leading-4 text-ink-500">{hint}</p>}
    </div>
  );
}

export type BadgeTone = "cyan" | "green" | "amber" | "red" | "violet" | "neutral";

const BADGE_TONES: Record<BadgeTone, string> = {
  cyan: "border-accent-100 bg-accent-50 text-accent-700",
  green: "border-safe-border bg-safe-bg text-safe-text",
  amber: "border-warn-border bg-warn-bg text-warn-text",
  red: "border-danger-border bg-danger-bg text-danger-text",
  violet: "border-quantum-border bg-quantum-bg text-quantum-text",
  neutral: "border-line-strong bg-ink-100 text-ink-700",
};

export function Badge({
  tone = "neutral",
  children,
  title,
  dot = false,
  className,
  "aria-label": ariaLabel,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  title?: string;
  dot?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <span title={title} aria-label={ariaLabel} className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none", BADGE_TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Callout({
  children,
  tone = "info",
  title,
}: {
  children: ReactNode;
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
}) {
  const styles = {
    info: "border-accent-100 bg-accent-50 text-accent-700",
    warning: "border-warn-border bg-warn-bg text-warn-text",
    danger: "border-danger-border bg-danger-bg text-danger-text",
    success: "border-safe-border bg-safe-bg text-safe-text",
  };
  const Icon = tone === "danger" || tone === "warning" ? AlertIcon : tone === "success" ? CheckIcon : InfoIcon;
  return (
    <div className={cx("flex gap-3 rounded-lg border px-3.5 py-3 text-xs leading-5", styles[tone])}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        {title && <p className="mb-0.5 font-semibold text-current">{title}</p>}
        {children}
      </div>
    </div>
  );
}

export function EducationalCallout({ children }: { children: ReactNode; icon?: string }) {
  return <Callout tone="info">{children}</Callout>;
}

export function WarningCallout({ children, tone = "amber" }: { children: ReactNode; tone?: "amber" | "red" }) {
  return <Callout tone={tone === "red" ? "danger" : "warning"}>{children}</Callout>;
}

export function StatusNotice({ kind, children }: { kind: "info" | "error" | "success"; children: ReactNode }) {
  return (
    <div role={kind === "error" ? "alert" : "status"} aria-live={kind === "error" ? "assertive" : "polite"}>
      <Callout tone={kind === "error" ? "danger" : kind === "success" ? "success" : "info"}>{children}</Callout>
    </div>
  );
}

export function CopyButton({ text, className = "", label = "Copy" }: { text: string; className?: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      aria-label={`${label} to clipboard`}
      onClick={async () => {
        try {
          if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
          await navigator.clipboard.writeText(text);
          setState("copied");
        } catch {
          setState("failed");
        } finally {
          window.setTimeout(() => setState("idle"), 1600);
        }
      }}
      className={cx("inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold text-accent-600 transition hover:bg-accent-50", className)}
    >
      {state === "copied" ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Unavailable" : label}</span>
    </button>
  );
}

export function Spinner({ label = "Working" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 py-10 text-sm text-ink-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-accent-600" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface-sunken px-6 py-8 text-center">
      <span className="mb-3 h-2 w-16 rounded-full bg-ink-200" aria-hidden="true" />
      <p className="text-sm font-semibold text-ink-900">{title}</p>
      <p className="mt-1 max-w-md text-xs leading-5 text-ink-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Request failed", message, action }: { title?: string; message: string; action?: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-danger-border bg-danger-bg p-4">
      <div className="flex gap-3">
        <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <div>
          <p className="text-sm font-semibold text-danger-text">{title}</p>
          <p className="mt-1 text-xs leading-5 text-danger-text/80">{message}</p>
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </div>
  );
}

export function FormField({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-ink-500">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-4 text-ink-500">{hint}</p>}
    </div>
  );
}

export const inputClassName = "min-h-10 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink-900 outline-none transition placeholder:text-ink-500 focus:border-accent-500 focus:ring-2 focus:ring-accent-100 disabled:cursor-not-allowed disabled:opacity-50";

export function NumberInput({ label, hint, id, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode; id?: string }) {
  const generated = useId();
  const inputId = id ?? generated;
  return <FormField label={label} hint={hint} htmlFor={inputId}><input id={inputId} type="number" className={cx(inputClassName, "font-mono", className)} {...props} /></FormField>;
}

export function SelectField({ label, hint, id, className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: ReactNode; hint?: ReactNode; id?: string }) {
  const generated = useId();
  const inputId = id ?? generated;
  return <FormField label={label} hint={hint} htmlFor={inputId}><select id={inputId} className={cx(inputClassName, className)} {...props}>{children}</select></FormField>;
}

export function Toggle({ checked, onChange, label, description, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <label className={cx("flex cursor-pointer items-start gap-3 rounded-lg border border-line-hairline bg-surface-sunken p-3", disabled && "cursor-not-allowed opacity-50")}>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
      <span className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-ink-300 transition peer-checked:bg-accent-600 peer-focus-visible:ring-2 peer-focus-visible:ring-accent-500 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-ink-900">{label}</span>
        {description && <span className="mt-0.5 block text-[11px] leading-4 text-ink-500">{description}</span>}
      </span>
    </label>
  );
}

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      <span role="tooltip" className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-50 hidden w-max max-w-64 -translate-x-1/2 rounded-md border border-line-strong bg-ink-900 px-2.5 py-1.5 text-center text-[11px] font-normal leading-4 text-white shadow-floating group-hover/tooltip:block group-focus-within/tooltip:block">
        {content}
      </span>
    </span>
  );
}
