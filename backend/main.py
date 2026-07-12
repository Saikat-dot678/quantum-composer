from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from analysis.circuit_analyzer import analyze_circuit
from circuit_builder import QuantumDependencyError, build_circuit
from codegen import generate_qasm, generate_qiskit_code
from engines.base import (
    EngineNotAvailableError,
    InfeasibleCircuitError,
    UnsupportedGateError,
    aer_available,
    stim_available,
)
from engines.crypto_protocols import get_runner
from engines.router import available_engines
from engines.router import simulate as route_simulation
from schemas import (
    AdvancedCircuitRequest,
    BB84Request,
    B92Request,
    CircuitAnalysisResponse,
    CircuitRequest,
    CodeResponse,
    E91Request,
    EnginesResponse,
    QasmResponse,
    QRNGRequest,
    SimulateV2Request,
    SimulationResponse,
    SimulationV2Response,
    ValidationResponse,
)
from simulator import simulate


DEFAULT_CORS_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3130",
    "http://127.0.0.1:3130",
)


def configured_cors_origins(raw: str | None = None) -> list[str]:
    """Return safe local defaults plus comma-separated deployment origins.

    ``QUANTUM_COMPOSER_CORS_ORIGINS`` is server-controlled configuration, not
    request input. Defaults remain enabled so local development and the
    production-server Playwright port work without environment setup.
    """
    configured = os.getenv("QUANTUM_COMPOSER_CORS_ORIGINS", "") if raw is None else raw
    candidates = [*DEFAULT_CORS_ORIGINS, *(part.strip() for part in configured.split(","))]
    origins: list[str] = []
    for candidate in candidates:
        normalized = candidate.rstrip("/")
        if normalized and normalized not in origins:
            origins.append(normalized)
    return origins


app = FastAPI(
    title="Quantum Composer API",
    description=(
        "Educational quantum circuit composer, multi-engine simulator, and "
        "quantum cryptography lab. Uses validated declarative circuit JSON; it "
        "never executes user-provided Python. Large qubit counts are supported "
        "only for structured circuits (Clifford/stabilizer, low-entanglement MPS); "
        "arbitrary 100-qubit statevector simulation is infeasible and is rejected "
        "with an explanation."
    ),
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


# ---------------------------------------------------------------------------
# V1 endpoints (unchanged behaviour)
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# V2 endpoints: engines, analysis, multi-engine simulation
# ---------------------------------------------------------------------------


@app.get("/engines", response_model=EnginesResponse)
def list_engines() -> EnginesResponse:
    return EnginesResponse(
        engines=available_engines(),
        stim_available=stim_available(),
        aer_available=aer_available(),
        honesty_note=(
            "Large qubit counts are only simulable for structured circuits: "
            "Clifford/stabilizer (Stim, Aer 'stabilizer') or low-entanglement "
            "(Aer MPS). Arbitrary universal circuits need 16 * 2**n bytes for an "
            "exact statevector and are infeasible beyond ~30 qubits. Real quantum "
            "hardware differs fundamentally: the chip is the quantum system and "
            "returns measurement samples, not a 2**n statevector."
        ),
    )


@app.post("/circuit/analyze", response_model=CircuitAnalysisResponse)
def analyze(request: AdvancedCircuitRequest) -> CircuitAnalysisResponse:
    try:
        analysis = analyze_circuit(
            num_qubits=request.num_qubits,
            num_clbits=request.num_clbits,
            operations=request.operations,
            max_memory_mb=1024.0,
            stim_available=stim_available(),
        )
        return CircuitAnalysisResponse(**analysis)
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=422, detail=f"Analysis failed: {exc}") from exc


@app.post("/circuit/simulate-v2", response_model=SimulationV2Response)
def simulate_v2(request: SimulateV2Request) -> SimulationV2Response:
    try:
        result = route_simulation(request.circuit, request.options)
        return SimulationV2Response(**result)
    except EngineNotAvailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (InfeasibleCircuitError, UnsupportedGateError) as exc:
        # Honest rejection of an impossible/unsupported circuit -> 422 with reason.
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except QuantumDependencyError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Simulation failed: {exc}") from exc


# ---------------------------------------------------------------------------
# Cryptography lab endpoints
# ---------------------------------------------------------------------------


def _run_protocol(protocol_id: str, **kwargs: Any) -> dict[str, Any]:
    runner = get_runner(protocol_id)
    return runner(**kwargs)


@app.post("/crypto/bb84/simulate")
def crypto_bb84(request: BB84Request) -> dict[str, Any]:
    return _run_protocol(
        "bb84",
        num_bits=request.num_bits,
        eve_enabled=request.eve_enabled,
        eve_strategy=request.eve_strategy,
        channel_error_rate=request.channel_error_rate,
        seed=request.seed,
    )


@app.post("/crypto/e91/simulate")
def crypto_e91(request: E91Request) -> dict[str, Any]:
    return _run_protocol(
        "e91",
        num_pairs=request.num_pairs,
        eve_enabled=request.eve_enabled,
        channel_error_rate=request.channel_error_rate,
        seed=request.seed,
    )


@app.post("/crypto/b92/simulate")
def crypto_b92(request: B92Request) -> dict[str, Any]:
    return _run_protocol(
        "b92",
        num_bits=request.num_bits,
        channel_error_rate=request.channel_error_rate,
        seed=request.seed,
    )


@app.post("/crypto/qrng/simulate")
def crypto_qrng(request: QRNGRequest) -> dict[str, Any]:
    return _run_protocol(
        "qrng",
        num_bits=request.num_bits,
        method=request.method,
        seed=request.seed,
    )
