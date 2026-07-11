from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from circuit_builder import QuantumDependencyError, build_circuit
from codegen import generate_qasm, generate_qiskit_code
from schemas import (
    CircuitRequest,
    CodeResponse,
    QasmResponse,
    SimulationResponse,
    ValidationResponse,
)
from simulator import simulate


app = FastAPI(
    title="Quantum Composer Lite API",
    description="Validated circuit construction and local Qiskit Aer simulation.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/circuit/validate", response_model=ValidationResponse)
def validate_circuit(request: CircuitRequest) -> ValidationResponse:
    return ValidationResponse(
        valid=True,
        message="Circuit JSON is valid.",
        operation_count=len(request.operations),
    )


@app.post("/circuit/qiskit-code", response_model=CodeResponse)
def qiskit_code(request: CircuitRequest) -> CodeResponse:
    return CodeResponse(code=generate_qiskit_code(request))


@app.post("/circuit/simulate", response_model=SimulationResponse)
def simulate_circuit(request: CircuitRequest) -> SimulationResponse:
    try:
        return SimulationResponse(**simulate(request))
    except QuantumDependencyError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Simulation failed: {exc}") from exc


@app.post("/circuit/qasm", response_model=QasmResponse)
def qasm(request: CircuitRequest) -> QasmResponse:
    try:
        circuit = build_circuit(request)
        return QasmResponse(qasm=generate_qasm(circuit))
    except QuantumDependencyError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"QASM export failed: {exc}") from exc
