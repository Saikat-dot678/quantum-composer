"""Circuit analysis and honest resource estimation.

This package computes structural facts about a circuit (gate mix, Clifford
classification, depth) and estimates the classical memory required for exact
simulation. Everything here is dependency-light and never allocates a
statevector, so it is safe to call on circuits that could never actually be
simulated exactly (e.g. 100-qubit arbitrary circuits).
"""

from analysis.circuit_analyzer import analyze_circuit
from analysis.resource_estimator import (
    RESOURCE_NOTES,
    estimate_resources,
    feasibility_from_log2_bytes,
)

__all__ = [
    "analyze_circuit",
    "estimate_resources",
    "feasibility_from_log2_bytes",
    "RESOURCE_NOTES",
]
