"""Future remote-execution boundary; v1 exposes no hardware route or credentials."""
from typing import Protocol
from schemas import CircuitRequest
class HardwareExecutor(Protocol):
    def submit(self, request: CircuitRequest, backend_name: str) -> str:
        """Submit a validated circuit and return a provider job identifier."""
        ...
