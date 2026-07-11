from schemas import CircuitRequest


def ordered_operations(request: CircuitRequest):
    """Return operations in visual moment order while preserving insertion order."""
    return sorted(
        enumerate(request.operations),
        key=lambda item: (
            item[1].moment if item[1].moment is not None else item[0],
            item[0],
        ),
    )
