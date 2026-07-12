import { Badge, type BadgeTone } from "./primitives";

const RISK_TONE: Record<string, BadgeTone> = {
  safe: "green",
  heavy: "amber",
  dangerous: "amber",
  infeasible: "red",
};

const FEASIBILITY_TONE: Record<string, BadgeTone> = {
  clifford_scalable: "green",
  exact_feasible: "green",
  exact_borderline: "amber",
  approximation_or_hardware: "red",
};

const FEASIBILITY_LABEL: Record<string, string> = {
  clifford_scalable: "Clifford — scales to large",
  exact_feasible: "Exact simulation feasible",
  exact_borderline: "Exact — borderline memory",
  approximation_or_hardware: "Approximation or hardware needed",
};

export function RiskBadge({ risk, prefix, subject = "Memory" }: { risk: string; prefix?: string; subject?: string }) {
  return (
    <Badge tone={RISK_TONE[risk] ?? "neutral"} title={`${subject} risk: ${risk}`}>
      {prefix ? `${prefix}: ` : ""}
      {risk}
    </Badge>
  );
}

export function FeasibilityBadge({ status }: { status: string }) {
  return <Badge tone={FEASIBILITY_TONE[status] ?? "neutral"}>{FEASIBILITY_LABEL[status] ?? status.replace(/_/g, " ")}</Badge>;
}

export function CliffordBadge({ isClifford }: { isClifford: boolean }) {
  return <Badge tone={isClifford ? "green" : "violet"}>{isClifford ? "Clifford-compatible" : "Non-Clifford"}</Badge>;
}
