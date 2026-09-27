"""Administrator-owned limits; caller budgets can only make them stricter."""
import math
import os
from engines.base import InfeasibleCircuitError


def server_memory_mb() -> int:
    return max(64, min(int(os.getenv("QUANTUM_COMPOSER_MAX_MEMORY_MB", "1024")), 65536))


def enforce_options(request, options):
    measurements = sum(op.gate == "measure" for op in request.operations)
    width = max(request.num_clbits, request.num_qubits) if not measurements else request.num_clbits
    if options.shots * max(width, measurements, 1) > 10_000_000:
        raise InfeasibleCircuitError("Sampling exceeds the 10,000,000 bit-record work limit. Reduce shots or measurements.")
    if options.shots * max(len(request.operations), 1) > 50_000_000:
        raise InfeasibleCircuitError("Circuit execution exceeds the operation-shot work limit. Reduce depth or shots.")
    return options.model_copy(update={"max_memory_mb": min(options.max_memory_mb, server_memory_mb() // 2)})


def mps_bond_limit(num_qubits, budget_mb):
    # Conservative tensor/scratch allowance: eight complex tensor copies.
    memory_bound = int(math.sqrt(budget_mb * 1024**2 / (256 * max(num_qubits, 1))))
    return max(1, min(256, memory_bound))
