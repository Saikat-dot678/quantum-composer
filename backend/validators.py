from typing import Protocol, Sequence, TypeVar


class MomentOperation(Protocol):
    moment: int


OperationT = TypeVar("OperationT", bound=MomentOperation)


def canonical_operation_order(operations: Sequence[OperationT]) -> list[OperationT]:
    """Return a non-mutating, stable numeric-moment ordering.

    Request-schema validation guarantees that every moment is a non-negative,
    strict integer. Python's sort is stable, so input position is the sole
    deterministic tie-breaker for legal parallel operations in one moment.
    """
    return sorted(operations, key=lambda operation: operation.moment)
