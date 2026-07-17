"""FastAPI routes for the Hardware Mapping workspace."""

from __future__ import annotations

import os
import threading
import time
from collections import defaultdict, deque
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request

from .availability import fake_provider_available
from .circuits import CircuitImportError
from .describe import describe_target, list_fake_backends, resolve_target, summarize_target
from .ibm_service import (
    IBMConnectionError,
    connect_session,
    connection_status,
    describe_ibm_backend,
    disconnect,
    list_ibm_backends,
)
from .schemas import (
    BackendDetail,
    BackendListResponse,
    CompareRequest,
    CompareResponse,
    ConnectRequest,
    ConnectionStatus,
    DescribeTargetRequest,
    ImportCircuitRequest,
    ImportCircuitResponse,
    TranspileRequest,
    TranspileResponse,
)
from .targets import TargetBuildError
from .transpilation import TranspilationError, compare_request, import_circuit, transpile_request


router = APIRouter(prefix="/hardware", tags=["Hardware Mapping"])

_attempts: dict[str, deque[float]] = defaultdict(deque)
_attempt_lock = threading.Lock()
_MAX_CONNECT_ATTEMPTS = 5
_CONNECT_WINDOW_SECONDS = 60.0


def _allowed_origins() -> set[str]:
    defaults = {
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3130",
        "http://127.0.0.1:3130",
    }
    configured = os.getenv("QUANTUM_COMPOSER_CORS_ORIGINS", "")
    return defaults | {part.strip().rstrip("/") for part in configured.split(",") if part.strip()}


def _check_session_boundary(request: Request) -> None:
    hostname = (request.url.hostname or "").lower()
    if request.url.scheme != "https" and hostname not in {"localhost", "127.0.0.1", "::1", "testserver"}:
        raise HTTPException(
            status_code=400,
            detail="Temporary IBM credentials require HTTPS outside localhost.",
        )
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") not in _allowed_origins():
        raise HTTPException(status_code=403, detail="This origin is not allowed to create a credential session.")

    client = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with _attempt_lock:
        attempts = _attempts[client]
        while attempts and now - attempts[0] > _CONNECT_WINDOW_SECONDS:
            attempts.popleft()
        if len(attempts) >= _MAX_CONNECT_ATTEMPTS:
            raise HTTPException(
                status_code=429,
                detail="Too many IBM connection attempts. Wait one minute before retrying.",
            )
        attempts.append(now)


@router.get("/status", response_model=ConnectionStatus)
def hardware_status() -> ConnectionStatus:
    return connection_status()


@router.post("/connect", response_model=ConnectionStatus)
def hardware_connect(body: ConnectRequest, request: Request) -> ConnectionStatus:
    _check_session_boundary(request)
    try:
        return connect_session(body.token, body.instance, body.channel)
    except IBMConnectionError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error


@router.post("/disconnect", response_model=ConnectionStatus)
def hardware_disconnect() -> ConnectionStatus:
    return disconnect()


def _generic_catalog():
    from .schemas import GenericTargetSource

    presets = [
        GenericTargetSource(kind="generic", topology="line", num_qubits=5, seed=42, noise=True),
        GenericTargetSource(kind="generic", topology="ring", num_qubits=8, seed=42, noise=True),
        GenericTargetSource(kind="generic", topology="grid", num_qubits=16, seed=42, noise=True),
    ]
    output = []
    for source in presets:
        target, meta = resolve_target(source)
        output.append(summarize_target(target, meta))
    return output


@router.get("/backends", response_model=BackendListResponse)
def hardware_backends(
    source: Literal["all", "fake", "generic", "ibm"] = "all",
    operational_only: bool = False,
    min_qubits: int = Query(default=1, ge=1, le=512),
    processor_family: str | None = Query(default=None, max_length=80),
    region: str | None = Query(default=None, max_length=40),
    dynamic_circuits: bool | None = None,
    max_pending_jobs: int | None = Query(default=None, ge=0, le=1_000_000),
    required_instruction: list[str] = Query(default=[]),
) -> BackendListResponse:
    backends = []
    warnings: list[str] = []
    if source in ("all", "generic"):
        backends.extend(_generic_catalog())
    if source in ("all", "fake"):
        if fake_provider_available():
            backends.extend(list_fake_backends())
        else:
            warnings.append(
                "Fake IBM snapshots are unavailable because qiskit-ibm-runtime is not installed; "
                "generic and manual targets still work."
            )
    if source in ("all", "ibm"):
        try:
            backends.extend(
                list_ibm_backends(
                    operational_only=operational_only,
                    min_qubits=min_qubits,
                    processor_family=processor_family,
                    region=region,
                    dynamic_circuits=dynamic_circuits,
                    required_instructions=required_instruction,
                )
            )
        except IBMConnectionError as error:
            if source == "ibm":
                raise HTTPException(status_code=503, detail=str(error)) from error
            warnings.append(str(error))

    required = {item.lower() for item in required_instruction}
    filtered = []
    for backend in backends:
        if backend.num_qubits < min_qubits:
            continue
        if operational_only and backend.source == "ibm" and backend.operational is not True:
            continue
        if processor_family and (backend.processor_family or "").lower() != processor_family.lower():
            continue
        if region and (backend.region or "").lower() != region.lower():
            continue
        if dynamic_circuits is not None and backend.dynamic_circuits is not dynamic_circuits:
            continue
        if max_pending_jobs is not None and backend.pending_jobs is not None and backend.pending_jobs > max_pending_jobs:
            continue
        if required and not required.issubset({item.lower() for item in backend.basis_gates}):
            continue
        filtered.append(backend)
    filtered.sort(key=lambda item: (item.source, -item.num_qubits, item.name))
    return BackendListResponse(backends=filtered, source=source, warnings=warnings)


@router.post("/target/describe", response_model=BackendDetail)
def hardware_describe(body: DescribeTargetRequest) -> BackendDetail:
    try:
        if body.target.kind == "ibm":
            return describe_ibm_backend(body.target.name)
        target, meta = resolve_target(body.target)
        return describe_target(target, meta)
    except IBMConnectionError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except TargetBuildError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/circuit/import", response_model=ImportCircuitResponse)
def hardware_import(body: ImportCircuitRequest) -> ImportCircuitResponse:
    try:
        return import_circuit(body)
    except CircuitImportError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/transpile", response_model=TranspileResponse)
def hardware_transpile(body: TranspileRequest) -> TranspileResponse:
    try:
        return transpile_request(body)
    except IBMConnectionError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except (CircuitImportError, TargetBuildError, TranspilationError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/compare", response_model=CompareResponse)
def hardware_compare(body: CompareRequest) -> CompareResponse:
    try:
        return compare_request(body)
    except (CircuitImportError, TargetBuildError, TranspilationError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
