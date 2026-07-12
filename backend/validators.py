from typing import Any, Sequence

from schemas import CircuitRequest


def ordered_operation_items(operations: Sequence[Any]):
    """Return ``(input_index, operation)`` pairs in visual moment order."""
    return sorted(
        enumerate(operations),
        key=lambda item: (
            item[1].moment if item[1].moment is not None else item[0],
            item[0],
        ),
    )


def ordered_operations(request: CircuitRequest):
    """Return operations in visual moment order while preserving insertion order."""
    return ordered_operation_items(request.operations)
